/**************************************************************************************
 nexl-engine-system-function

 Copyright (c) 2016-2020 Liam Ray
 License : Apache 2.0
 WebSite : http://www.nexl-js.com

 Set of utility functions to enhance nexl expressions functionality
 **************************************************************************************/

const j79 = require('j79-utils');
const util = require('util');
const deepMerge = require('deepmerge');

var nexlFuncs = {};

///////////////////////////////////////////////////////////////////////////////////////////
// helper functions
///////////////////////////////////////////////////////////////////////////////////////////

// replace all in array or string
function replaceAll4Array(entity, searchItem, replace) {
	for (var index = 0; index < entity.length; index++) {
		if (entity[index] === searchItem) {
			entity[index] = replace;
		}
	}

	return entity;
}

function concatPrimitives(arguments) {
	var result = '';

	for (var index in arguments) {
		var item = arguments[index];

		if (!j79.isPrimitive(item)) {
			j79.winston.debug('Skipping non-primitive value in concat() function');
			continue;
		}

		result += item;
	}

	return result;
}

function concatArrays(arguments) {
	var result = [];

	for (var index in arguments) {
		var item = arguments[index];

		if (j79.isArray(item)) {
			result = result.concat(item);
		} else {
			result.push(item);
		}


	}

	return result;
}

function concatObjects(arguments) {
	var result = {};

	for (var index in arguments) {
		var item = arguments[index];

		if (!j79.isObject(item)) {
			j79.winston.debug('Skipping non-object value in concat() function');
			continue;
		}

		result = deepMerge(result, item);
	}

	return result;
}

function isPositiveNr(nr) {
	return nr === nr && nr >= 0;
}


///////////////////////////////////////////////////////////////////////////////////////////
// functions to assign to context
///////////////////////////////////////////////////////////////////////////////////////////

nexlFuncs.updAt = function (arrOrStr, val, index) {
	var type = j79.getType(arrOrStr);
	if (type !== j79.TYPE_STRING && type !== j79.TYPE_ARRAY) {
		return arrOrStr;
	}

	index = parseInt(index);
	if (!isPositiveNr(index)) {
		return arrOrStr;
	}

	if (type === j79.TYPE_ARRAY) {
		arrOrStr[index] = val;
	}

	if (type === j79.TYPE_STRING && j79.isPrimitive(val)) {
		arrOrStr = arrOrStr.substr(0, index) + val + arrOrStr.substr(index + 1);
	}

	return arrOrStr;
};

nexlFuncs.insAt = function (arrOrStr, val, index) {
	var type = j79.getType(arrOrStr);
	if (type !== j79.TYPE_STRING && type !== j79.TYPE_ARRAY) {
		return arrOrStr;
	}

	index = parseInt(index);
	if (!isPositiveNr(index)) {
		return arrOrStr;
	}

	if (type === j79.TYPE_ARRAY) {
		arrOrStr.splice(index, 0, val);
	}

	if (type === j79.TYPE_STRING && j79.isPrimitive(val)) {
		arrOrStr = arrOrStr.substr(0, index) + val + arrOrStr.substr(index);
	}

	return arrOrStr;
};

nexlFuncs.delAt = function (arrOrStr, index, cnt) {
	var type = j79.getType(arrOrStr);
	if (type !== j79.TYPE_STRING && type !== j79.TYPE_ARRAY) {
		return arrOrStr;
	}

	index = parseInt(index);
	if (!isPositiveNr(index)) {
		return arrOrStr;
	}

	cnt = parseInt(cnt);
	if (!isPositiveNr(cnt)) {
		cnt = 1;
	}

	if (type === j79.TYPE_ARRAY) {
		arrOrStr.splice(index, cnt);
	}

	if (type === j79.TYPE_STRING) {
		arrOrStr = arrOrStr.substr(0, index) + arrOrStr.substr(index + cnt);
	}

	return arrOrStr;
};

nexlFuncs.keyVals = function (obj, key) {
	if (!j79.isObject(obj)) {
		j79.winston.debug('The keyVal() function is not applicable because first parameter is not an object. Skipping...');
		return obj;
	}

	// validating key. it must be either primitive or array
	if (!j79.isPrimitive(key) && !j79.isArray(key)) {
		j79.winston.debug('The keyVal() function is not applicable because second parameter must be a primitive or array, but got a parameters of [%s] type', j79.getType(key));
		return undefined;
	}

	var result = {};
	var keys = j79.wrapWithArrayIfNeeded(key);

	// iteration over keys
	for (var index in keys) {
		key = keys[index];
		if (j79.isPrimitive(key)) {
			result[key] = obj[key];
		}
	}

	return result;
};

// resolves key set from "obj" at "level" level
nexlFuncs.keys = function (obj, level) {
	if (!j79.isObject(obj)) {
		return obj;
	}

	level = (level === undefined) ? 0 : parseInt(level);

	if (level === 0 || level !== level) {
		return Object.keys(obj);
	}

	var result = [];
	for (var key in obj) {
		var val = obj[key];
		if (j79.isObject(val)) {
			var tmp = nexlFuncs.keys(val, level - 1);
			result = result.concat(tmp);
		}
	}

	return result;
};

// resolves values from "obj" at "level" level
nexlFuncs.vals = function (obj, level) {
	if (!j79.isObject(obj)) {
		return obj;
	}

	level = (level === undefined) ? 0 : parseInt(level);

	if (level === 0 || level !== level) {
		return j79.getObjectValues(obj);
	}

	var result = [];
	for (var key in obj) {
		var val = obj[key];
		if (j79.isObject(val)) {
			var tmp = nexlFuncs.vals(val, level - 1);
			result = result.concat(tmp);
		}
	}

	return result;
};

// makes obj from arguments
nexlFuncs.obj = function () {
	var result = {};
	for (var index = 0; index < arguments.length / 2; index++) {
		var key = arguments[index * 2];
		if (!j79.isPrimitive(key)) {
			throw util.format('Object key must be a primitive type at [%s] position', index * 2);
		}
		var val = arguments[index * 2 + 1];
		result[key] = val;
	}
	return result;
};

// makes array from arguments
nexlFuncs.arr = function () {
	var result = [];
	for (var index in arguments) {
		result.push(arguments[index]);
	}
	return result;
};

nexlFuncs.concat = function () {
	if (arguments.length < 1) {
		return;
	}

	var firstArgType = j79.getType(arguments[0]);
	if (j79.isPrimitiveType(firstArgType)) {
		firstArgType = j79.TYPE_STRING;
	}

	switch (firstArgType) {
		case j79.TYPE_STRING: {
			return concatPrimitives(arguments);
		}

		case j79.TYPE_ARRAY: {
			return concatArrays(arguments);
		}

		case j79.TYPE_OBJECT: {
			return concatObjects(arguments);
		}
	}

	return undefined;
};

nexlFuncs.charCodeAt = function (str, index) {
	return str.charCodeAt(parseInt(index));
};

nexlFuncs.setKey = function (obj, currentKey, newKey) {
	if (j79.isObject(obj)) {
		var val = obj[currentKey];
		delete obj[currentKey];
		obj[newKey] = val;
	}

	return obj;
};

nexlFuncs.setVal = function (obj, key, val) {
	if (j79.isObject(obj)) {
		obj[key] = val;
	}

	return obj;
};

nexlFuncs.makeObj = function (key, val) { // <---- DEPRECATED ! Use obj() function instead
	var result = {};

	if (j79.isPrimitive(key)) {
		result[key] = val;
	}

	if (j79.isArray(key)) {
		for (var index in key) {
			result[key[index]] = val;
		}
	}

	return result;
};

// replaces items in array or string
nexlFuncs.replaceAll = function (arrOrStr, searchItem, replace) {
	if (j79.isArray(arrOrStr)) {
		return replaceAll4Array(arrOrStr, searchItem, replace);
	}

	if (j79.isString(arrOrStr)) {
		return arrOrStr.replace(new RegExp(searchItem, 'g'), replace);
	}

	return arrOrStr;
};

nexlFuncs.not = function (param) {
	if (j79.isBool(param)) {
		return !param;
	} else {
		return param;
	}
};

///////////////////////////////////////////////////////////////////////////////
// is*

nexlFuncs.isMatch = function (str, regex, flags) {
	if (!j79.isString(str)) {
		return str;
	}

	return new RegExp(regex, flags).test(str);
};

// is string or array contains value
nexlFuncs.isContains = function (arrOrStr, item) {
	if (j79.isArray(arrOrStr) || j79.isString(arrOrStr)) {
		return arrOrStr.indexOf(item) >= 0;
	}

	return arrOrStr;
};

nexlFuncs.isEquals = function (item1, item2) {
	return item1 === item2;
};

nexlFuncs.isEq = function (item1, item2) {
	return item1 === item2;
};

nexlFuncs.isGT = function (item1, item2) {
	return item1 > item2;
};

nexlFuncs.isLT = function (item1, item2) {
	return item1 < item2;
};

nexlFuncs.isGE = function (item1, item2) {
	return item1 >= item2;
};

nexlFuncs.isLE = function (item1, item2) {
	return item1 <= item2;
};

nexlFuncs.isBool = function (item) {
	return j79.isBool(item);
};

nexlFuncs.isStr = function (item) {
	return j79.isString(item);
};

nexlFuncs.isNum = function (item) {
	return j79.isNumber(item);
};

nexlFuncs.isNull = function (item) {
	return item === null;
};

nexlFuncs.isUndefined = function (item) {
	return item === undefined;
};

nexlFuncs.isNaN = function (item) {
	return item !== item;
};

nexlFuncs.isPrimitive = function (item) {
	return j79.isPrimitive(item);
};

nexlFuncs.isArray = function (item) {
	return j79.isArray(item);
};

nexlFuncs.isObject = function (item) {
	return j79.isObject(item);
};

///////////////////////////////////////////////////////////////////////////////
// if*

nexlFuncs.ifMatch = function (str, regex, thenIf, elseIf) {
	if (!j79.isString(str)) {
		return str;
	}

	return nexlFuncs.isMatch(str, regex) ? thenIf : elseIf;
};

nexlFuncs.ifNMatch = function (str, regex, thenIf, elseIf) {
	return nexlFuncs.ifMatch(str, regex, elseIf, thenIf);
};

nexlFuncs.ifMatchEx = function (str, regex, flags, thenIf, elseIf) {
	if (!j79.isString(str)) {
		return str;
	}

	return nexlFuncs.isMatch(str, regex, flags) ? thenIf : elseIf;
};

nexlFuncs.ifNMatchEx = function (str, regex, flags, thenIf, elseIf) {
	return nexlFuncs.ifMatchEx(str, regex, flags, elseIf, thenIf);
};

nexlFuncs.ifContains = function (arrOrStr, item, thenIf, elseIf) {
	if (j79.isArray(arrOrStr) || j79.isString(arrOrStr)) {
		return arrOrStr.indexOf(item) >= 0 ? thenIf : elseIf;
	}

	return arrOrStr;
};

nexlFuncs.ifNContains = function (arrOrStr, item, thenIf, elseIf) {
	return nexlFuncs.ifContains(arrOrStr, item, elseIf, thenIf);
};

nexlFuncs.ifEquals = function (item1, item2, thenIf, elseIf) {
	return nexlFuncs.isEquals(item1, item2) ? thenIf : elseIf;
};

nexlFuncs.ifNEquals = function (item1, item2, thenIf, elseIf) {
	return nexlFuncs.ifEquals(item1, item2, elseIf, thenIf);
};

nexlFuncs.ifEq = function (item1, item2, thenIf, elseIf) {
	return nexlFuncs.isEquals(item1, item2) ? thenIf : elseIf;
};

nexlFuncs.ifNEq = function (item1, item2, thenIf, elseIf) {
	return nexlFuncs.ifEq(item1, item2, elseIf, thenIf);
};

nexlFuncs.ifGT = function (item1, item2, thenIf, elseIf) {
	return item1 > item2 ? thenIf : elseIf;
};

nexlFuncs.ifLT = function (item1, item2, thenIf, elseIf) {
	return item1 < item2 ? thenIf : elseIf;
};

nexlFuncs.ifGE = function (item1, item2, thenIf, elseIf) {
	return item1 >= item2 ? thenIf : elseIf;
};

nexlFuncs.ifLE = function (item1, item2, thenIf, elseIf) {
	return item1 <= item2 ? thenIf : elseIf;
};

nexlFuncs.ifBool = function (item, thenIf, elseIf) {
	return nexlFuncs.isBool(item) ? thenIf : elseIf;
};

nexlFuncs.ifNBool = function (item, thenIf, elseIf) {
	return nexlFuncs.ifBool(item, elseIf, thenIf);
};

nexlFuncs.ifStr = function (item, thenIf, elseIf) {
	return nexlFuncs.isStr(item) ? thenIf : elseIf;
};

nexlFuncs.ifNStr = function (item, thenIf, elseIf) {
	return nexlFuncs.ifStr(item, elseIf, thenIf);
};

nexlFuncs.ifNum = function (item, thenIf, elseIf) {
	return nexlFuncs.isNum(item) ? thenIf : elseIf;
};

nexlFuncs.ifNNum = function (item, thenIf, elseIf) {
	return nexlFuncs.ifNum(item, elseIf, thenIf);
};

nexlFuncs.ifNull = function (item, thenIf, elseIf) {
	return nexlFuncs.isNull(item) ? thenIf : elseIf;
};

nexlFuncs.ifNNull = function (item, thenIf, elseIf) {
	return nexlFuncs.ifNull(item, elseIf, thenIf);
};

nexlFuncs.ifUndefined = function (item, thenIf, elseIf) {
	return nexlFuncs.isUndefined(item) ? thenIf : elseIf;
};

nexlFuncs.ifNUndefined = function (item, thenIf, elseIf) {
	return nexlFuncs.ifUndefined(item, elseIf, thenIf);
};

nexlFuncs.ifNaN = function (item, thenIf, elseIf) {
	return nexlFuncs.isNaN(item) ? thenIf : elseIf;
};

nexlFuncs.ifNNaN = function (item, thenIf, elseIf) {
	return nexlFuncs.ifNaN(item, elseIf, thenIf);
};

nexlFuncs.ifPrimitive = function (item, thenIf, elseIf) {
	return nexlFuncs.isPrimitive(item) ? thenIf : elseIf;
};

nexlFuncs.ifNPrimitive = function (item, thenIf, elseIf) {
	return nexlFuncs.ifPrimitive(item, elseIf, thenIf);
};

nexlFuncs.ifArray = function (item, thenIf, elseIf) {
	return nexlFuncs.isArray(item) ? thenIf : elseIf;
};

nexlFuncs.ifNArray = function (item, thenIf, elseIf) {
	return nexlFuncs.ifArray(item, elseIf, thenIf);
};

nexlFuncs.ifObject = function (item, thenIf, elseIf) {
	return nexlFuncs.isObject(item) ? thenIf : elseIf;
};

nexlFuncs.ifNObject = function (item, thenIf, elseIf) {
	return nexlFuncs.ifObject(item, elseIf, thenIf);
};

///////////////////////////////////////////////////////////////////////////////
// math funcs

// accepts multiple arguments
nexlFuncs.add = function (number) {
	if (!j79.isNumber(number)) {
		return number;
	}

	if (arguments.length < 2) {
		return number + 1;
	}

	var result = number;
	for (var index = 1; index < arguments.length; index++) {
		result += arguments[index];
	}

	return result;
};

nexlFuncs.inc = nexlFuncs.add; // left for backward compatibility

nexlFuncs.sub = function (number) {
	if (!j79.isNumber(number)) {
		return number;
	}

	if (arguments.length < 2) {
		return number - 1;
	}

	var result = number;
	for (var index = 1; index < arguments.length; index++) {
		result -= arguments[index];
	}

	return result;
};
nexlFuncs.dec = nexlFuncs.sub; // left for backward compatibility

nexlFuncs.div = function (number) {
	if (!j79.isNumber(number)) {
		return number;
	}

	var result = number;
	for (var index = 1; index < arguments.length; index++) {
		result /= arguments[index];
	}

	return result;
};

nexlFuncs.mult = function (number) {
	if (!j79.isNumber(number)) {
		return number;
	}

	var result = number;
	for (var index = 1; index < arguments.length; index++) {
		result *= arguments[index];
	}

	return result;
};

nexlFuncs.mod = function (number) {
	if (!j79.isNumber(number)) {
		return number;
	}

	var result = number;
	for (var index = 1; index < arguments.length; index++) {
		result %= arguments[index];
	}

	return result;
};

///////////////////////////////////////////////////////////////////////////////////////////
// assigning system functions to nexl context
///////////////////////////////////////////////////////////////////////////////////////////
module.exports.assign = function (context) {
	for (var item in nexlFuncs) {
		context.nexl.funcs[item] = nexlFuncs[item];
	}
};

module.exports.nexlFuncs = nexlFuncs;