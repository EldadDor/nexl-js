/**************************************************************************************
 nexl-engine-utils

 Copyright (c) 2016-2020 Liam Ray
 License : Apache 2.0
 WebSite : http://www.nexl-js.com

 Set of utility functions for nexl-engine
 **************************************************************************************/

const nexlExpressionsParser = require('./nexl-expressions-parser');
const nexlSourceUtils = require('./nexl-source-utils');
const nexlSystemFuncs = require('./nexl-functoins');
const j79 = require('j79-utils');
const deepMerge = require('deepmerge');
const vm = require('vm');
const util = require('util');
var logger = require('./logger').logger();

const SPECIAL_CHARS_MAP = {
	'\\n': '\n',
	'\\t': '\t'
};

function deepMergeInner(obj1, obj2) {
	if (obj2 === undefined) {
		return obj1;
	}

	if (!j79.isObject(obj2)) {
		return obj1;
	}

	return deepMerge(obj1, obj2);
}

function hasEvaluateToUndefinedFlag(obj) {
	return ( ( obj || {} ).nexl || {} ).EVALUATE_TO_UNDEFINED === true;
}

/////////////////////////////////////////////////////////////////////////////////////

// we need a contextWrapper to store there initFuncs
function createContextWrapper() {
	var contextWrapper = {};
	contextWrapper.initFuncs = [];
	contextWrapper.context = {};
	return contextWrapper;
}

function attachStaticFields(context, externalArgs) {
	// system and user functions
	context.nexl.funcs = {};
	context.nexl.usr = {};

	// nexl.functions.system and nexl.functions.user are deprecated and left for backward compatibility, probably will be removed in future versions, right for JUN-2017 )
	context.nexl.functions = {};
	context.nexl.functions.system = context.nexl.funcs;
	context.nexl.functions.user = context.nexl.usr;

	// supplying external args
	context.nexl.args = externalArgs;
}

function supplyStandardJSLibs(context) {
	context.Math = Math;
	context.isFinite = isFinite;
	context.isNaN = isNaN;
	context.parseFloat = parseFloat;
	context.parseInt = parseInt;
}

function addInitFunc(contextWrapper, func, priority) {
	var item = {
		func: func,
		priority: j79.isNumber(priority) ? priority : 0
	};

	for (var i = 0; i < contextWrapper.initFuncs.length; i++) {
		if (item.priority < contextWrapper.initFuncs[i].priority) {
			break;
		}
	}

	contextWrapper.initFuncs.splice(i, 0, item);
}

function supplyNexlAPI(contextWrapper, nexlEngine) {
	// supplying nexlize() function
	contextWrapper.context.nexl.nexlize = function (nexlExpression, externalArgs4Function) {
		// merging externalArgs4Function to a context
		var newContext = deepMergeInner(contextWrapper.context, externalArgs4Function);

		// is evaluate to undefined flag
		var isEvaluateToUndefined = hasEvaluateToUndefinedFlag(newContext);

		// running nexl engine
		var result = new nexlEngine(newContext, isEvaluateToUndefined).processItem(nexlExpression);

		// restoring context
		contextWrapper.context = newContext;
		return result;
	};

	// supplying set() function
	contextWrapper.context.nexl.set = function (key, val) {
		contextWrapper.context[key] = val;
	};

	// supplying get() function
	contextWrapper.context.nexl.get = function (key) {
		return contextWrapper.context[key];
	};

	// supplying addInitFunc() function
	contextWrapper.context.nexl.addInitFunc = function (func) {
		var arg1 = arguments[0];
		var arg2 = arguments[1];

		if (j79.isFunction(arg1)) {
			addInitFunc(contextWrapper, arg1, arg2);
			return;
		}

		if (j79.isFunction(arg2)) {
			addInitFunc(contextWrapper, arg2, arg1);
			return;
		}

		throw 'Please provide a function as first or second argument for addInitFunc() function';
	};

	// supplying print() function ( print to log )
	contextWrapper.context.nexl.print = function (data) {
		logger.debug('nexl.print() | [%s]', JSON.stringify(data));
	};
}

function attachNexlObject(contextWrapper, externalArgs, nexlEngine) {
	// nexl object
	contextWrapper.context.nexl = {};

	// static fields like nexl.funcs
	attachStaticFields(contextWrapper.context, externalArgs);
	// standard JavaScript linraries like Math
	supplyStandardJSLibs(contextWrapper.context);
	// giving an access to functions from nexl sources to nexl API
	supplyNexlAPI(contextWrapper, nexlEngine);
	// assign nexl functions
	nexlSystemFuncs.assign(contextWrapper.context);

	return contextWrapper;
}

function embedNexlSource2Context(context, nexlSource) {
	// assembling source code from JavaScript files
	var sourceCode = nexlSourceUtils.assembleSourceCode(nexlSource);

	vm.createContext(context);

	try {
		vm.runInContext(sourceCode, context, { timeout: 1000 });
	} catch (e) {
		throw "Got a problem with a JavaScript file : " + e;
	}

	return context;
}

function postInitContext(contextWrapper, nexlEngine, externalArgs) {
	// merging defaultArgs to context
	if (j79.isObject(contextWrapper.context.nexl.defaultArgs)) {
		contextWrapper.context = deepMergeInner(contextWrapper.context, contextWrapper.context.nexl.defaultArgs);
	}

	// merging external args to context
	if (j79.isObject(externalArgs)) {
		contextWrapper.context = deepMergeInner(contextWrapper.context, externalArgs);
	}

	// is nexl.init a string ?
	if (j79.isString(contextWrapper.context.nexl.init)) {
		// evaluating nexl.init expression
		new nexlEngine(contextWrapper.context).processItem(contextWrapper.context.nexl.init);
	}

	// is nexl.init a function ?
	if (j79.isFunction(contextWrapper.context.nexl.init)) {
		// evaluating nexl.init() function
		// new nexlEngine(contextWrapper.context).processItem('${nexl.init()}');
		contextWrapper.context.nexl.init();
	}

	// running initFuncs if present
	for (var i = 0; i < contextWrapper.initFuncs.length; i++) {
		var func = contextWrapper.initFuncs[i].func;
		func();
	}

	return contextWrapper.context;
}

function createContext(nexlSource, externalArgs, nexlEngine) {
	var contextWrapper = createContextWrapper();
	attachNexlObject(contextWrapper, externalArgs, nexlEngine);
	contextWrapper.context = embedNexlSource2Context(contextWrapper.context, nexlSource);
	return postInitContext(contextWrapper, nexlEngine, externalArgs);
}

/////////////////////////////////////////////////////////////////////////////////////

function replaceSpecialChar(item, char) {
	var lastPos = 0;
	var newStr = item;

	while ((lastPos = newStr.indexOf(char, lastPos)) >= 0) {
		var escaped = j79.escapePrecedingSlashes(newStr, lastPos);
		lastPos = escaped.correctedPos;
		newStr = escaped.escapedStr;

		if (escaped.escaped) {
			lastPos++;
			continue;
		}

		newStr = newStr.substr(0, lastPos) + SPECIAL_CHARS_MAP[char] + newStr.substr(lastPos + 2);
	}

	return newStr;
}


// string representation of \n, \t characters is replaced with their real value
function replaceSpecialChars(item) {
	if (!j79.isString(item)) {
		return item;
	}

	var result = item;

	var specialChars = Object.keys(SPECIAL_CHARS_MAP);
	for (var index in specialChars) {
		result = replaceSpecialChar(result, specialChars[index]);
	}

	return result;
}

function castInner(value, currentType, requiredTypeJs) {
	var result;

	// NUM -> BOOL
	if (currentType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.NUM && requiredTypeJs === nexlExpressionsParser.JS_PRIMITIVE_TYPES.BOOL) {
		result = (value !== 0);
		logger.debug('Casting numeric to boolean, [result=%s]', result);
		return result;
	}

	// NUM -> STR
	if (currentType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.NUM && requiredTypeJs === nexlExpressionsParser.JS_PRIMITIVE_TYPES.STR) {
		result = value + '';
		logger.debug('Casting numeric to boolean, [result=%s]', result);
		return result;
	}

	// BOOL -> NUM
	if (currentType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.BOOL && requiredTypeJs === nexlExpressionsParser.JS_PRIMITIVE_TYPES.NUM) {
		result = value ? 1 : 0;
		logger.debug('Casting boolean to numeric, [result=%s]', result);
		return result;
	}

	// BOOL -> STR
	if (currentType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.BOOL && requiredTypeJs === nexlExpressionsParser.JS_PRIMITIVE_TYPES.STR) {
		result = value + '';
		logger.debug('Casting boolean to string, [result=%s]', result);
		return result;
	}

	// STR -> NUM
	if (currentType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.STR && requiredTypeJs === nexlExpressionsParser.JS_PRIMITIVE_TYPES.NUM) {
		result = parseFloat(value);
		if (isNaN(result)) {
			result = undefined;
		}
		logger.debug('Casting string to numeric, [result=%s]', result);
		return result;
	}

	// STR -> BOOL
	if (currentType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.STR && requiredTypeJs === nexlExpressionsParser.JS_PRIMITIVE_TYPES.BOOL) {
		result = undefined;
		if (value === 'false') {
			result = false;
		}

		if (value === 'true') {
			result = true;
		}

		logger.debug('Casting string to boolean, [result=%s]', result);

		return result;
	}

	logger.debug('Current value of a %s type cannot be casted to %s. Skipping this action...', currentType, requiredTypeJs);

	return value;
}

// example : value = 101; nexlType = 'bool';
function cast(value, type) {
	// if type is not specified
	if (type === undefined) {
		logger.debug('Type is not specified. Skipping typecast...');
		return value;
	}

	// resolving JavaScript type
	var jsType = nexlExpressionsParser.NEXL_TYPES[type];

	// validating ( should not happen )
	if (jsType === undefined) {
		throw util.format('Unknown [%s] type in [%s] expression. Use one of the following types : [%s]', type, this.nexlExpressionMD.str, Object.keys(nexlExpressionsParser.NEXL_TYPES).join(','));
	}

	var currentType = j79.getType(value);

	// if both types are same, return value as is
	if (currentType === jsType) {
		logger.debug('Source and destinations types are same [%s]. Skipping typecast...', jsType);
		return value;
	}

	// cast to null
	if (jsType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.NULL) {
		logger.debug('Destination type is %s. Converting current value to %s', jsType, jsType);
		return null;
	}

	// cast to undefined
	if (jsType === nexlExpressionsParser.JS_PRIMITIVE_TYPES.UNDEFINED) {
		logger.debug('Destination type is %s. Converting current value to %s', jsType, jsType);
		return undefined;
	}

	return castInner(value, currentType, jsType);
}


function hadnleArg(item, val, obj) {
	var currentRef = obj;
	var currentItem = item;

	var lastDotPos = 0;
	while ((lastDotPos = currentItem.indexOf('.', lastDotPos)) >= 0) {
		var escaped = j79.escapePrecedingSlashes(currentItem, lastDotPos);
		lastDotPos = escaped.correctedPos;
		currentItem = escaped.escapedStr;
		if (escaped.escaped) {
			lastDotPos++;
			continue;
		}

		var key = currentItem.substr(0, lastDotPos);
		currentItem = currentItem.substr(lastDotPos + 1);
		lastDotPos = 0;
		if (currentRef[key] === undefined) {
			currentRef[key] = {};
		}
		currentRef = currentRef[key];
	}

	currentRef[currentItem] = val;
}

function extractTypeAndCast(value) {
	var pos = -1;
	var nexlType;
	for (nexlType in nexlExpressionsParser.NEXL_TYPES) {
		var regex = new RegExp('(' + nexlExpressionsParser.ACTIONS.CAST + nexlType + ')$');
		pos = value.search(regex);
		if (pos >= 0) {
			break;
		}
	}

	// not found ? good bye
	if (pos < 0) {
		return value;
	}

	// is escaped ?
	var escaped = j79.escapePrecedingSlashes(value, pos);
	var newValue = escaped.escapedStr;
	if (escaped.escaped) {
		return newValue;
	}

	newValue = newValue.substr(0, escaped.correctedPos);

	return cast(newValue, nexlType);
}


function resolveObjValue(obj, key) {
	const val = obj[key];
	if (j79.isString(val)) {
		return val;
	}

	if (j79.isArray(val) && val.length > 0) {
		const result = val[0];
		logger.warn(`The [${key}] argument provided several times. Using the first [value=${result}]`);
		return result;
	}

	throw `The [${key}] argument should be of a string type. Got a value of the [${j79.getType(val)}] type.`;
}

// example obj =  { 'a.b.c.d': 10 }
// output : { a: {b: {c:{ d: 10}}}}
function handleArgs(obj) {
	var result = {};
	for (var key in obj) {
		let val = resolveObjValue(obj, key);
		val = extractTypeAndCast(val);
		hadnleArg(key, val, result);
	}

	return result;
}

function produceKeyValuesPairs(rootKey, obj, result) {
	for (var key in obj) {
		var item = obj[key];

		var subKey = rootKey === undefined ? key : rootKey + '.' + key;

		if (j79.isObject(item)) {
			produceKeyValuesPairs(subKey, item, result);
			continue;
		}

		if (j79.isFunction(item)) {
			continue;
		}

		result.push(subKey + '=' + item);
	}
}

function setReadOnlyProperty(obj, key, value) {
	Object.defineProperty(obj, key, {
		enumerable: false,
		configurable: true,
		value: value
	});
}

function reloadLoggerInstance() {
	logger = require('./logger').logger();
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// exports
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports.hasEvaluateToUndefinedFlag = hasEvaluateToUndefinedFlag;
module.exports.produceKeyValuesPairs = produceKeyValuesPairs;
module.exports.handleArgs = handleArgs;
module.exports.cast = cast;
module.exports.deepMergeInner = deepMergeInner;
module.exports.createContext = createContext;
module.exports.replaceSpecialChars = replaceSpecialChars;
module.exports.setReadOnlyProperty = setReadOnlyProperty;
module.exports.reloadLoggerInstance = reloadLoggerInstance;
