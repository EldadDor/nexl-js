/**************************************************************************************
 nexl-engine

 Copyright (c) 2016-2020 Liam Ray
 License : Apache 2.0
 WebSite : http://www.nexl-js.com

 nexl expressions processor
 **************************************************************************************/

const util = require('util');
const j79 = require('j79-utils');
const nexlSourceUtils = require('./nexl-source-utils');
const nexlExpressionsParser = require('./nexl-expressions-parser');
const mdParser = require('./md-parser');
const nexlEngineUtils = require('./nexl-engine-utils');
const js2xmlparser = require("js2xmlparser");
const YAML = require('yamljs');
let logger = require('./logger').logger();

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// consts
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const THIS = '_this_';
const PARENT = '_parent_';
const ITEM = '_item_';
const INDEX = '_index_';
const KEY = '_key_';
const VALUE = '_value_';

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EvalAndSubstChunks
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

EvalAndSubstChunks.prototype.validate = function (chunk2Substitute, item) {
	if (!j79.isValSet(item)) {
		throw util.format('The [%s] expression is evaluated to [%s] and can\'t be substituted into [%s] string', chunk2Substitute.str, item, this.data.str);
	}

	if (!j79.isPrimitive(item)) {
		throw util.format('The internal expression [%s] cannot be evaluated as %s data type in [%s] expression( must be a primitive or array of primitives )', chunk2Substitute.str, j79.getType(item), this.data.str);
	}
};

EvalAndSubstChunks.prototype.validateAndSubstitute = function (chunk2Substitute, values, pos) {
	var newResult = [];

	for (var i = 0; i < values.length; i++) {
		var item = values[i];

		this.validate(chunk2Substitute, item);

		for (var j = 0; j < this.result.length; j++) {
			// cloning array
			var currentItem = this.result[j].slice(0);

			// substituting value
			currentItem[pos] = item;

			// adding to new result
			newResult.push(currentItem);
		}
	}

	this.result = newResult;
};


EvalAndSubstChunks.prototype.evalAndSubstChunksInner = function () {
	// cloning chunks array and wrapping with additional array
	this.result = [this.data.chunks.slice(0)];

	// is one of the chunks is array
	var isArrayFlag = false;

	// iterating over chunkSubstitutions
	for (var pos in this.data.chunkSubstitutions) {
		// current chunk ( which is parsed nexl expression itself )
		var chunk2Substitute = this.data.chunkSubstitutions[pos];

		// evaluating this chunk
		// chunkValue must be a primitive or array of primitives. can't be object|function or array of objects|functions|arrays
		var chunkValue = new NexlExpressionEvaluator(this.context, chunk2Substitute, this.data.objInfo).eval();

		// !U MISCELLANEOUS_OPERATIONS action
		if (chunkValue === undefined && this.isEvaluateToUndefined) {
			return undefined;
		}

		if (!isArrayFlag && j79.isArray(chunkValue)) {
			isArrayFlag = true;
		}

		// wrapping with array
		var chunkValues = j79.wrapWithArrayIfNeeded(chunkValue);

		// validating and substituting chunkValue to result
		this.validateAndSubstitute(chunk2Substitute, chunkValues, pos);
	}

	var finalResult = [];
	// iterating over additional array and joining chunks
	for (var i = 0; i < this.result.length; i++) {
		var item = this.result[i];
		if (item.length === 1) {
			item = item[0];
		} else {
			item = item.join('');
		}
		finalResult.push(item);
	}

	if (finalResult.length === 1 && !isArrayFlag) {
		finalResult = finalResult[0];
	}

	if (finalResult === this.context) {
		finalResult = undefined;
	}

	return finalResult;
};

EvalAndSubstChunks.prototype.throwParserErrorIfNeeded = function (condition, errorMessage) {
	if (condition) {
		throw errorMessage;
	}
};

EvalAndSubstChunks.prototype.evalAndSubstChunks = function () {
	var chunksCnt = this.data.chunks.length;
	var chunkSubstitutionsCnt = Object.keys(this.data.chunkSubstitutions).length;

	// no chunks ? do get a null !
	if (chunksCnt < 1) {
		this.throwParserErrorIfNeeded(chunkSubstitutionsCnt !== 0, util.format('Parser error ! Got a chunkSubstitutionsCnt = %s when the chunksCnt = %s for [%s] expression', chunkSubstitutionsCnt, chunksCnt, this.data.str));
		return null;
	}

	// when there is nothing to substitute, return just the one item from chunks
	if (chunkSubstitutionsCnt < 1) {
		this.throwParserErrorIfNeeded(chunksCnt > 1, util.format('Parser error ! Got a chunkSubstitutionsCnt = %s when the chunksCnt = %s for [%s] expression', chunkSubstitutionsCnt, chunksCnt, this.data.str));
		return this.data.chunks[0];
	}

	// when we have the only 1 item to substitute
	if (this.data.chunks.length === 1 && chunkSubstitutionsCnt === 1) {
		this.throwParserErrorIfNeeded(this.data.chunks[0] !== null, util.format('Parser error ! There is only 1 chunk to substitute, but his cell is not null for [%s] expression', this.data.str));
		return new NexlExpressionEvaluator(this.context, j79.getObjectValues(this.data.chunkSubstitutions)[0], this.data.objInfo).eval();
	}

	return this.evalAndSubstChunksInner();
};

function EvalAndSubstChunks(context, isEvaluateToUndefined, data) {
	this.context = context;
	this.isEvaluateToUndefined = isEvaluateToUndefined;
	this.data = data;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// NexlExpressionEvaluator
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

NexlExpressionEvaluator.prototype.retrieveEvaluateToUndefinedAction = function () {
	// iterating over actions
	for (var index in this.nexlExpressionMD.actions) {
		var action = this.nexlExpressionMD.actions[index];
		if (action.actionId === nexlExpressionsParser.ACTIONS.MISCELLANEOUS_OPERATIONS && action.actionValue === nexlExpressionsParser.MISCELLANEOUS_OPERATIONS.EVALUATE_TO_UNDEFINED) {
			this.isEvaluateToUndefined = true;
			return;
		}
	}

	this.isEvaluateToUndefined = false;
};

NexlExpressionEvaluator.prototype.try2ResolveNexlFuncs = function (key) {
	if (this.context.nexl.usr[key] !== undefined) {
		logger.debug('Resolved nexl user function for key=[%s]', key);
		return this.context.nexl.usr[key];
	}

	if (this.context.nexl.funcs[key] !== undefined) {
		logger.debug('Resolved nexl function for key=[%s]', key);
		return this.context.nexl.funcs[key];
	}

	if (this.context.Math[key] !== undefined) {
		logger.debug('Resolved Math function for key=[%s]', key);
		return this.context.Math[key];
	}

	logger.debug('Nothing found in nexl user/system functions for key=[%s]', key);
	return undefined;
};

NexlExpressionEvaluator.prototype.resolveObject = function (key) {
	// skipping undefined key
	if (key === undefined) {
		this.newResult.push(this.result);
		logger.debug('Key is undefined. Skipping...');
		return;
	}

	// not a primitive ? make result undefined
	if (!j79.isPrimitive(key)) {
		this.newResult.push(undefined);
		logger.debug('Key is not a primitive. Skipping...');
		return;
	}

	// __parent__
	if (key == PARENT) {
		var val = this.result === this.context ? this.objInfo.parent : this.result[PARENT];
		val = val === this.context ? undefined : val;
		this.newResult.push(val);
		this.thisOrParentAreApplied = true;
		logger.debug('Resolving %s element', PARENT);
		return;
	}

	// __this__
	if (key == THIS) {
		this.newResult.push(this.this);
		this.thisOrParentAreApplied = true;
		logger.debug('Resolving %s element', THIS);
		return;
	}

	// _item_
	if (key == ITEM) {
		this.newResult.push(this.objInfo.item);
		logger.debug('Resolving %s element', ITEM);
		return;
	}

	// _index_
	if (key == INDEX) {
		this.newResult.push(this.objInfo.index);
		logger.debug('Resolving %s element', INDEX);
		return;
	}

	// _key_
	if (key == KEY) {
		this.newResult.push(this.objInfo.key);
		logger.debug('Resolving %s element', KEY);
		return;
	}

	// _value_
	if (key == VALUE) {
		this.newResult.push(this.objInfo.value);
		logger.debug('Resolving %s element', VALUE);
		return;
	}

	var newResult = this.result[key];
	logger.debug('Resolving value for key=[%s]', key);

	// trying to resolve system and user functions from context
	if (newResult === undefined && this.result === this.context) {
		logger.debug('Got undefined value for key=[%s]. Trying to resolve a value from user and system function definitions', key);
		newResult = this.try2ResolveNexlFuncs(key);
	}

	this.newResult.push(newResult);
};

NexlExpressionEvaluator.prototype.applyPropertyResolutionActionInner = function () {
	if (this.needDeepResolution4NextActions) {
		this.expandObjectKeys();
	}

	var resultBefore = this.result;
	this.thisOrParentAreApplied = false;

	var keys = j79.wrapWithArrayIfNeeded(this.assembledChunks);
	this.newResult = [];

	// iterating over keys
	for (var i in keys) {
		var key = keys[i];

		// resolving
		this.resolveObject(key);
	}

	this.result = j79.unwrapFromArrayIfPossible(this.newResult);

	// this.result and resultBefore must be a context
	// setting up a parent for this.result if it object and doesn't have parent
	// don't setup parent if __this__ or __parent__ was retrieved
	if (this.result !== this.context && resultBefore !== this.context && j79.isObject(this.result) && this.result[PARENT] === undefined && !this.thisOrParentAreApplied) {
		nexlEngineUtils.setReadOnlyProperty(this.result, PARENT, resultBefore);
	}
};

NexlExpressionEvaluator.prototype.assembleChunks4CurrentAction = function () {
	var data = {};
	data.chunks = this.action.actionValue.chunks;
	data.chunkSubstitutions = this.action.actionValue.chunkSubstitutions;
	data.objInfo = this.makeObjInfo();

	var actionValue = new EvalAndSubstChunks(this.context, this.isEvaluateToUndefined, data).evalAndSubstChunks();
	if (j79.isLogLevel('silly')) {
		logger.debug('[actionValue=%s]', this.strigifySafely(actionValue));
	}
	return actionValue;
};

NexlExpressionEvaluator.prototype.applyPropertyResolutionAction = function () {
	this.makeDeepResolution4String();

	// if not an object, skip action
	if (!j79.isObject(this.result)) {
		logger.debug('actionNr = [%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	this.assembledChunks = this.assembleChunks4CurrentAction();

	// skipping object resolution for undefined key
	if (this.assembledChunks === undefined) {
		return;
	}

	// accumulation actionsAsString ( actionsAsString is used for ~O action as object key )
	if (j79.isArray(this.assembledChunks)) {
		this.actionsAsString.push('[]');
	}
	if (j79.isPrimitive(this.assembledChunks)) {
		this.actionsAsString.push(this.assembledChunks);
	}

	// resolving value from last this.result
	this.applyPropertyResolutionActionInner();
};

NexlExpressionEvaluator.prototype.evalFunctionAction = function () {
	// not a function ? good bye
	if (!j79.isFunction(this.result)) {
		// reset function params stack
		this.funcParamsStack = [];
		logger.debug('[actionNr=%s] is not applicable because current value is not a function. Skipping...', this.actionNr);
		return;
	}

	// copying params from stack
	var params = this.funcParamsStack.slice(0);

	// reset function params stack
	this.funcParamsStack = [];

	for (var index in this.action.actionValue) {
		var funcParamMD = this.action.actionValue[index];
		var funcParam = new NexlExpressionEvaluator(this.context, funcParamMD, this.makeObjInfo()).eval();
		params.push(funcParam);
	}

	this.result = this.result.apply(this.context, params);
	this.needDeepResolution4NextActions = true;
};

NexlExpressionEvaluator.prototype.resolveRealArrayIndex = function (item) {
	var arrayIndex;
	if (j79.isObject(item)) {
		arrayIndex = new NexlExpressionEvaluator(this.context, item, this.makeObjInfo()).eval();
	} else {
		arrayIndex = item;
	}

	// first item
	if (arrayIndex === nexlExpressionsParser.ARRAY_FIRST_ITEM) {
		return 0;
	}

	// last item
	if (arrayIndex === nexlExpressionsParser.ARRAY_LAST_ITEM) {
		return this.result.length - 1;
	}

	// validating ( must be an integer )
	if (!j79.isNumber(arrayIndex) || (arrayIndex + '').indexOf('.') >= 0) {
		throw util.format('The [%s] nexl expression used in array index cannot be evaluated as %s. It must be an integer number or "^" or "$" characters. Expression is [%s], actionNr is [%s]', item.str, j79.getType(arrayIndex), this.nexlExpressionMD.str, this.actionNr + 1);
	}

	// for negative numbers recalculating them relating to the end
	return arrayIndex < 0 ? this.result.length - 1 + arrayIndex : arrayIndex;
};

NexlExpressionEvaluator.prototype.resolveArrayRange = function (item) {
	var min = this.resolveRealArrayIndex(item['min']);
	var max = this.resolveRealArrayIndex(item['max']);

	return {
		min: min,
		max: max
	};
};

NexlExpressionEvaluator.prototype.evalArrayIndexesAction4ArrayInner = function () {
	this.makeDeepResolution();

	var newResult = [];

	// iterating over arrayIndexes
	for (var index in this.action.actionValue.arrayIndexes) {
		var item = this.action.actionValue.arrayIndexes[index];
		var range = this.resolveArrayRange(item);

		for (var i = range.min; i <= Math.min(range.max, this.result.length - 1); i++) {
			var item = this.result[i];
			newResult.push(item);
		}
	}

	if (newResult.length === 1) {
		this.result = newResult[0];
		return;
	}

	if (newResult.length < 1) {
		this.result = undefined;
		return;
	}

	this.result = newResult;
};

NexlExpressionEvaluator.prototype.applyArrayIterationIfApplicable = function () {
	var iterationExpression = this.action.actionValue.iterationExpression;
	if (iterationExpression === undefined) {
		return;
	}

	logger.debug('Iterating over array elements. [actionId=\'%s\'], [actionNr=%s/%s]', this.action.actionId, ( this.actionNr + 1 ), this.nexlExpressionMD.actions.length);

	// is current value not an array ?
	if (!j79.isArray(this.result)) {
		logger.debug('Iteration is not applicable because current value is not an array. Skipping...');
		return false;
	}

	this.makeDeepResolution();

	// preparing objInfo
	var objInfo = this.makeObjInfo();
	var iterations = [];

	// iterating over current result and evaluating each element
	for (var i = 0; i < this.result.length; i++) {
		objInfo.item = this.result[i];
		objInfo.index = i;
		var iteration = new NexlExpressionEvaluator(this.context, iterationExpression, objInfo).eval();
		iterations.push(iteration);
	}

	this.result = iterations;
};

NexlExpressionEvaluator.prototype.evalArrayIndexesAction4Array = function () {
	// apply array indexes if not empty
	if (this.action.actionValue.arrayIndexes.length > 0) {
		this.evalArrayIndexesAction4ArrayInner();
	}

	this.applyArrayIterationIfApplicable();
};
NexlExpressionEvaluator.prototype.evalArrayIndexesAction4String = function () {
	// skipping if there is no indexes for substring
	if (this.action.actionValue.length < 1) {
		return;
	}

	var newResult = [];

	// iterating over arrayIndexes
	for (var index in this.action.actionValue.arrayIndexes) {
		var item = this.action.actionValue.arrayIndexes[index];
		var range = this.resolveArrayRange(item);

		var subStr = this.result.substring(range.min, range.max + 1);
		newResult.push(subStr);
	}

	this.result = j79.unwrapFromArrayIfPossible(newResult);
};

NexlExpressionEvaluator.prototype.applyObjectIteration = function () {
	var iterationExpression = this.action.actionValue.iterationExpression;
	if (iterationExpression === undefined) {
		logger.debug('Iteration expression is not specified for object. Skipping...');
		return;
	}

	logger.debug('Iterating over object fields. [actionId=\'%s\'], [actionNr=%s/%s]', this.action.actionId, ( this.actionNr + 1 ), this.nexlExpressionMD.actions.length);

	this.makeDeepResolution();

	// preparing objInfo
	var objInfo = this.makeObjInfo();
	var iterations = [];

	// iterating over current result and evaluating each element
	for (var key in this.result) {
		objInfo.key = key;
		objInfo.value = this.result[key];
		var iteration = new NexlExpressionEvaluator(this.context, this.action.actionValue.iterationExpression, objInfo).eval();
		iterations.push(iteration);
	}

	this.result = iterations;
};

NexlExpressionEvaluator.prototype.applyArrayIndexesAction = function () {
	this.makeDeepResolution4String();

	if (j79.isString(this.result)) {
		this.evalArrayIndexesAction4String();
		return;
	}

	if (j79.isArray(this.result)) {
		this.evalArrayIndexesAction4Array();
		return;
	}

	if (j79.isObject(this.result)) {
		this.applyObjectIteration();
		return;
	}

	if (j79.isLogLevel('debug')) {
		logger.debug('[actionNr=%s] is not applicable because current value %s is not if array/string/object type. Skipping...', this.actionNr, j79.getType(this.result));
	}
};

NexlExpressionEvaluator.prototype.applyDefaultValueAction = function () {
	this.makeDeepResolution4String();

	// is value not set for this.result ?
	if (this.result !== undefined) {
		// don't need to a apply default value action
		logger.debug('[actionNr=%s] is not applicable because current value is not undefined. Skipping...', this.actionNr);
		return;
	}

	this.result = this.assembleChunks4CurrentAction();
	this.needDeepResolution4NextActions = false;
};

NexlExpressionEvaluator.prototype.applyCastAction = function () {
	this.makeDeepResolution4String();
	this.result = nexlEngineUtils.cast(this.result, this.action.actionValue);
};

NexlExpressionEvaluator.prototype.convert2Object = function () {
	this.makeDeepResolution4String();

	if (j79.isObject(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is already object. Skipping...', this.actionNr);
		return;
	}

	var key = this.actionsAsString.length < 1 ? 'obj' : this.actionsAsString.join('.');

	var obj = {};
	if (this.result !== undefined) {
		obj[key] = this.result;
	}
	this.result = obj;
};

NexlExpressionEvaluator.prototype.resolveObjectKeys = function () {
	this.makeDeepResolution4String();

	if (!j79.isObject(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	if (this.needDeepResolution4NextActions) {
		this.expandObjectKeys();
	}

	this.result = Object.keys(this.result);
};

NexlExpressionEvaluator.prototype.resolveObjectValues = function () {
	this.makeDeepResolution4String();

	if (!j79.isObject(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	this.makeDeepResolution();

	this.result = j79.obj2ArrayIfNeeded(this.result);
};

NexlExpressionEvaluator.prototype.produceKeyValuesPairs = function () {
	this.makeDeepResolution4String();

	if (!j79.isObject(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	this.makeDeepResolution();

	var result = [];
	nexlEngineUtils.produceKeyValuesPairs(undefined, this.result, result);

	this.result = result.join('\n');
	this.needDeepResolution4NextActions = false;
};

NexlExpressionEvaluator.prototype.produceXML = function () {
	this.makeDeepResolution4String();

	if (!j79.isObject(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	this.makeDeepResolution();

	var root = this.actionsAsString.length < 1 ? 'root' : this.actionsAsString.join('.');
	this.result = js2xmlparser.parse(root, this.result);
	this.needDeepResolution4NextActions = false;
};

NexlExpressionEvaluator.prototype.produceYAML = function () {
	this.makeDeepResolution4String();

	if (!j79.isObject(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	this.makeDeepResolution();

	this.result = YAML.stringify(this.result);
	this.needDeepResolution4NextActions = false;
};

NexlExpressionEvaluator.prototype.applyObjectOperationsAction = function () {
	var actionValue = this.action.actionValue;

	switch (actionValue) {
		// ~O
		case nexlExpressionsParser.OBJECT_OPERATIONS.CONVERT_TO_OBJECT : {
			this.convert2Object();
			return;
		}

		// ~K
		case nexlExpressionsParser.OBJECT_OPERATIONS.RESOLVE_KEYS : {
			this.resolveObjectKeys();
			return;
		}

		// ~V
		case nexlExpressionsParser.OBJECT_OPERATIONS.RESOLVE_VALUES : {
			this.resolveObjectValues();
			return;
		}

		// ~P
		case nexlExpressionsParser.OBJECT_OPERATIONS.PRODUCE_KEY_VALUE_PAIRS : {
			this.produceKeyValuesPairs();
			return;
		}

		// ~X
		case nexlExpressionsParser.OBJECT_OPERATIONS.PRODUCE_XML : {
			this.produceXML();
			return;
		}

		// ~Y
		case nexlExpressionsParser.OBJECT_OPERATIONS.PRODUCE_YAML : {
			this.produceYAML();
			return;
		}
	}
};

NexlExpressionEvaluator.prototype.isContainsValue = function (val, reversedKey) {
	// for array or object iterating over each value and querying
	if (j79.isArray(val) || j79.isObject(val)) {
		for (var index in val) {
			if (this.isContainsValue(val[index], reversedKey)) {
				return true;
			}
		}

		return false;
	}

	var reverseKeys = j79.wrapWithArrayIfNeeded(reversedKey);

	// reversedKey can be array
	for (var index in reverseKeys) {
		if (reverseKeys[index] === val) {
			return true;
		}
	}

	return false;
};

NexlExpressionEvaluator.prototype.applyObjectKeyReverseResolutionAction = function () {
	this.makeDeepResolution4String();

	// reverse resolution action is applying only for objects
	if (!j79.isObject(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	this.makeDeepResolution();

	// assembling action value
	var reverseKey = this.assembleChunks4CurrentAction();

	var newResult = [];

	// iterating over keys in this.result and checking
	for (var key in this.result) {
		var item = this.result[key];

		if (this.isContainsValue(item, reverseKey)) {
			newResult.push(key);
		}
	}

	this.result = newResult;
	this.needDeepResolution4NextActions = false;
};

NexlExpressionEvaluator.prototype.convert2Array = function () {
	if (j79.isArray(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is already array. Skipping...', this.actionNr);
		return;
	}

	this.result = this.result === undefined ? [] : [this.result];
};

NexlExpressionEvaluator.prototype.makeUniq = function () {
	var newResult = [];
	for (var index in this.result) {
		var item = this.result[index];
		if (newResult.indexOf(item) < 0) {
			newResult.push(item);
		}
	}

	this.result = newResult;
};

NexlExpressionEvaluator.prototype.findDuplicatesAndRemove = function (item) {
	var cnt = 0;
	var index = 0;
	while (true) {
		index = this.result.indexOf(item, index);
		if (index < 0) {
			break;
		}
		this.result.splice(index, 1);
		cnt++;
	}

	return cnt > 1;
};

NexlExpressionEvaluator.prototype.makeDuplicates = function () {
	var newResult = [];
	while (this.result.length > 0) {
		var item = this.result[0];
		if (this.findDuplicatesAndRemove(item)) {
			newResult.push(item);
		}
	}

	this.result = newResult;
};

// #S, #s, #U, #D, #LEN, #F array operations action
NexlExpressionEvaluator.prototype.applyArrayOperationsAction = function () {
	this.makeDeepResolution4String();

	// is convert to array ?
	if (this.action.actionValue === nexlExpressionsParser.ARRAY_OPERATIONS.CONVERT_TO_ARRAY) {
		this.convert2Array();
		return;
	}

	// not an array ? bye bye
	if (!j79.isArray(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an array. Skipping...', this.actionNr);
		return;
	}

	this.makeDeepResolution();

	switch (this.action.actionValue) {
		// #S
		case nexlExpressionsParser.ARRAY_OPERATIONS.SORT_ASC: {
			this.result = this.result.sort();
			return;
		}

		// #s
		case nexlExpressionsParser.ARRAY_OPERATIONS.SORT_DESC: {
			this.result = this.result.sort();
			this.result = this.result.reverse();
			return;
		}

		// #U
		case nexlExpressionsParser.ARRAY_OPERATIONS.UNIQUE: {
			this.makeUniq();
			return;
		}

		// #D
		case nexlExpressionsParser.ARRAY_OPERATIONS.DUPLICATES: {
			this.makeDuplicates();
			return;
		}

		// #LEN
		case nexlExpressionsParser.ARRAY_OPERATIONS.LENGTH: {
			this.result = this.result.length;
			return;
		}

		// #F
		case nexlExpressionsParser.ARRAY_OPERATIONS.GET_FIRST_OR_NOTHING: {
			this.result = this.result.length === 1 ? this.result[0] : undefined;
			return;
		}
	}
};

NexlExpressionEvaluator.prototype.eliminateAllFromArray = function (value) {
	var index;
	while ((index = this.result.indexOf(value)) >= 0) {
		this.result.splice(index, 1);
	}
};

NexlExpressionEvaluator.prototype.applyEliminateArrayElements = function () {
	this.makeDeepResolution();

	// resolving action value
	var actionValue = this.assembleChunks4CurrentAction();

	// wrapping with array
	actionValue = j79.wrapWithArrayIfNeeded(actionValue);
	// making array copy because of self bug : ${arr-${arr}}
	actionValue = actionValue.concat();

	// iterating over actionValue and eliminating array elements
	for (var index in actionValue) {
		var item = actionValue[index];
		this.eliminateAllFromArray(item);
	}
};

NexlExpressionEvaluator.prototype.applyEliminateObjectProperties = function () {
	if (this.needDeepResolution4NextActions) {
		this.expandObjectKeys();
	}

	// resolving action value
	var actionValue = this.assembleChunks4CurrentAction();

	// wrapping with array
	actionValue = j79.wrapWithArrayIfNeeded(actionValue);

	// iterating over actionValue array
	for (var index in actionValue) {
		var item = actionValue[index];
		if (!j79.isValSet(item)) {
			continue;
		}

		if (j79.isPrimitive(item)) {
			delete this.result[item];
		}
	}
};

NexlExpressionEvaluator.prototype.applyEliminateAction = function () {
	this.makeDeepResolution4String();

	if (j79.isArray(this.result)) {
		this.applyEliminateArrayElements();
		return;
	}

	if (j79.isObject(this.result)) {
		this.applyEliminateObjectProperties();
		return;
	}

	logger.debug('[actionNr=%s] is not applicable because current value is of [%s] type. Skipping...', this.actionNr, j79.getType(this.result));
};

NexlExpressionEvaluator.prototype.appendArrayElements = function () {
	// resolving action value
	var actionValue = this.assembleChunks4CurrentAction();

	// if actionValue is array, merging 2 arrays. otherwise just pushing a value to existing
	if (j79.isArray(actionValue)) {
		this.result = this.result.concat(actionValue);
	} else {
		this.result.push(actionValue);
	}
};

NexlExpressionEvaluator.prototype.mergeObjects = function () {
	// resolving action value
	var actionValue = this.assembleChunks4CurrentAction();

	if (!j79.isObject(actionValue)) {
		return;
	}

	this.result = nexlEngineUtils.deepMergeInner(this.result, actionValue);
};

NexlExpressionEvaluator.prototype.applyAppendMergeConcatAction = function () {
	this.makeDeepResolution4String();

	if (j79.isArray(this.result)) {
		this.appendArrayElements();
		return;
	}

	if (j79.isObject(this.result)) {
		this.mergeObjects();
		return;
	}

	// strings merge
	if (j79.isPrimitive(this.result)) {
		var actionValue = this.assembleChunks4CurrentAction();
		this.result = '' + this.result + actionValue;
		return;
	}

	logger.debug('[actionNr=%s] is not applicable because current value is of [%s] type. Skipping...', this.actionNr, j79.getType(this.result));
};

NexlExpressionEvaluator.prototype.applyJoinArrayElementsAction = function () {
	this.makeDeepResolution4String();

	// not an array ? bye bye
	if (!j79.isArray(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not an array. Skipping...', this.actionNr);
		return;
	}

	this.makeDeepResolution();

	// resolving action value
	var actionValue = this.assembleChunks4CurrentAction();

	// validating action value
	if (!j79.isPrimitive(actionValue)) {
		throw util.format('Array elements cannot be joined with %s type in [%s] expression. Use primitive data types to join array elements', j79.getType(actionValue), this.nexlExpressionMD.str);
	}

	this.result = this.result.join(actionValue);
	this.needDeepResolution4NextActions = false;
};

NexlExpressionEvaluator.prototype.applyStringOperationsAction = function () {
	this.makeDeepResolution4String();

	if (this.action.actionValue === nexlExpressionsParser.STRING_OPERATIONS.STRINGIFY) {
		this.makeDeepResolution();
		this.result = JSON.stringify(this.result);
		return;
	}

	// not a string ? good bye
	if (!j79.isString(this.result)) {
		logger.debug('[actionNr=%s] is not applicable because current value is not a string. Skipping...', this.actionNr);
		return;
	}

	this.needDeepResolution4NextActions = false;

	switch (this.action.actionValue) {
		// ^U
		case nexlExpressionsParser.STRING_OPERATIONS.UPPERCASE: {
			this.result = this.result.toUpperCase();
			return;
		}

		// ^U1
		case nexlExpressionsParser.STRING_OPERATIONS.CAPITALIZE_FIRST_LETTER: {
			this.result = this.result.charAt(0).toUpperCase() + this.result.slice(1);
			return;
		}

		// ^L
		case nexlExpressionsParser.STRING_OPERATIONS.LOWERCASE: {
			this.result = this.result.toLowerCase();
			return;
		}

		// ^LEN
		case nexlExpressionsParser.STRING_OPERATIONS.LENGTH: {
			this.result = this.result.length;
			return;
		}

		// ^T
		case nexlExpressionsParser.STRING_OPERATIONS.TRIM: {
			this.result = this.result.trim();
			return;
		}
	}
};

NexlExpressionEvaluator.prototype.makeEmptyItemsUndefined = function () {
	// converting empty array to undefined
	if (j79.isArray(this.result)) {
		this.result = this.result.length < 1 ? undefined : this.result;
		return;
	}

	// converting empty object to undefined
	if (j79.isObject(this.result)) {
		this.result = Object.keys(this.result).length < 1 ? undefined : this.result;
		return;
	}

	// converting empty string to undefined
	if (j79.isString(this.result)) {
		this.result = this.result.length < 1 ? undefined : this.result;
		return;
	}

	logger.debug('[actionNr=%s] is not applicable because current value is not an empty string/array/object. Skipping...', this.actionNr);
};

NexlExpressionEvaluator.prototype.clone = function () {
	if (j79.isArray(this.result)) {
		this.result = this.result.slice(0);
		return;
	}

	if (j79.isObject(this.result)) {
		this.result = nexlEngineUtils.deepMergeInner({}, this.result);
		return;
	}
};

NexlExpressionEvaluator.prototype.miscellaneousOperations = function () {
	// empty values
	if (this.action.actionValue === nexlExpressionsParser.MISCELLANEOUS_OPERATIONS.EVALUATE_TO_UNDEFINED) {
		return;
	}

	this.makeDeepResolution4String();

	switch (this.action.actionValue) {
		case nexlExpressionsParser.MISCELLANEOUS_OPERATIONS.MAKE_EMPTY_ITEMS_UNDEFINED: {
			this.makeEmptyItemsUndefined();
			return;
		}

		case nexlExpressionsParser.MISCELLANEOUS_OPERATIONS.CLONE: {
			this.clone();
			return;
		}
	}
};

NexlExpressionEvaluator.prototype.applyMandatoryValueValidatorAction = function () {
	this.makeDeepResolution4String();

	if (this.result !== undefined) {
		logger.debug('[actionNr=%s] is not applicable because current value is not undefined. Skipping...', this.actionNr);
		return;
	}

	var defaultErrorMessage = util.format(' The [%s] expression calculated as [undefined] value but has a [*] mandatory value validator', this.nexlExpressionMD.str);

	// does this action have a custom error message ?
	if (this.action.actionValue.chunks[0] === '') {
		// default error message
		throw defaultErrorMessage;
	}

	// resolving custom error message
	var customErrorMessage;
	try {
		customErrorMessage = this.assembleChunks4CurrentAction();
	} catch (e) {
		throw util.format('%s\nFailed to evaluate custom error message. Reason : %s', defaultErrorMessage, e);
	}

	throw customErrorMessage;
};


NexlExpressionEvaluator.prototype.applyPushFunctionParamAction = function () {
	this.makeDeepResolution();
	this.funcParamsStack.push(this.result);
	this.init(this.actionNr + 1);
};

NexlExpressionEvaluator.prototype.makeDeepResolution4String = function () {
	if (!j79.isString(this.result)) {
		return;
	}

	this.makeDeepResolution();
	this.needDeepResolution4NextActions = false;
};

NexlExpressionEvaluator.prototype.applyAssignVarAction = function () {
	this.context[this.action.actionValue] = this.result;
};

NexlExpressionEvaluator.prototype.applySeparatorAction = function () {
	this.init(this.actionNr + 1);
};

NexlExpressionEvaluator.prototype.applyInvertedPropertyResolution = function () {
	this.makeDeepResolution4String();

	if (!j79.isObject(this.result)) {
		logger.debug('actionNr = [%s] is not applicable because current value is not an object. Skipping...', this.actionNr);
		return;
	}

	this.expandObjectKeys();

	// resolving key
	var key = this.assembleChunks4CurrentAction();

	var keys = j79.wrapWithArrayIfNeeded(key);
	var result = [];

	// iteration over keys
	for (var index in keys) {
		key = keys[index];

		if (j79.isPrimitive(key)) {
			delete this.result[key];
		}
	}

	for (key in this.result) {
		result.push(this.result[key]);
	}

	this.result = result;
};

NexlExpressionEvaluator.prototype.applyAction = function () {
	switch (this.action.actionId) {
		// . property resolution action
		case nexlExpressionsParser.ACTIONS.PROPERTY_RESOLUTION: {
			this.applyPropertyResolutionAction();
			return;
		}

		// [] array indexes action
		case nexlExpressionsParser.ACTIONS.ARRAY_INDEX: {
			this.applyArrayIndexesAction();
			return;
		}

		// () function action
		case nexlExpressionsParser.ACTIONS.FUNCTION_CALL: {
			this.evalFunctionAction();
			return;
		}

		// @ default value action
		case nexlExpressionsParser.ACTIONS.DEF_VALUE: {
			this.applyDefaultValueAction();
			return;
		}

		// : cast action
		case nexlExpressionsParser.ACTIONS.CAST: {
			this.applyCastAction();
			return;
		}

		// ~K, ~V, ~O, ~X, ~P, ~Y, ~Z converters action
		case nexlExpressionsParser.ACTIONS.OBJECT_OPERATIONS: {
			this.applyObjectOperationsAction();
			return;
		}

		// < object key reverse resolution action
		case nexlExpressionsParser.ACTIONS.OBJECT_KEY_REVERSE_RESOLUTION: {
			this.applyObjectKeyReverseResolutionAction();
			return;
		}

		// #S, #s, #U, #D, #LEN, #A array operations action
		case nexlExpressionsParser.ACTIONS.ARRAY_OPERATIONS: {
			this.applyArrayOperationsAction();
			return;
		}

		// - eliminate elements
		case nexlExpressionsParser.ACTIONS.ELIMINATE: {
			this.applyEliminateAction();
			return;
		}

		// + append ( arrays, objects, primitives )
		case nexlExpressionsParser.ACTIONS.APPEND_MERGE_CONCAT: {
			this.applyAppendMergeConcatAction();
			return;
		}

		// & join array elements action
		case nexlExpressionsParser.ACTIONS.JOIN_ARRAY_ELEMENTS: {
			this.applyJoinArrayElementsAction();
			return;
		}

		// ^U, ^L, ^LEN, ^T, ^Z string operations action
		case nexlExpressionsParser.ACTIONS.STRING_OPERATIONS: {
			this.applyStringOperationsAction();
			return;
		}

		// !E, !U miscellaneous value operations
		case nexlExpressionsParser.ACTIONS.MISCELLANEOUS_OPERATIONS: {
			this.miscellaneousOperations();
			return;
		}

		// * mandatory value action
		case nexlExpressionsParser.ACTIONS.MANDATORY_VALUE_VALIDATOR: {
			this.applyMandatoryValueValidatorAction();
			return;
		}

		// | push current result to function parameters stack
		case nexlExpressionsParser.ACTIONS.PUSH_FUNCTION_PARAM: {
			this.applyPushFunctionParamAction();
			return;
		}

		// = assign variable value action
		case nexlExpressionsParser.ACTIONS.ASSIGN_VARIABLE: {
			this.applyAssignVarAction();
			return;
		}

		// ; actions separator
		case nexlExpressionsParser.ACTIONS.SEPARATOR: {
			this.applySeparatorAction();
			return;
		}

		// % inverted property resolution
		case nexlExpressionsParser.ACTIONS.INVERTED_PROPERTY_RESOLUTION: {
			this.applyInvertedPropertyResolution();
			return;
		}
	}

	throw util.format('The [%s] action in [%s] expression is reserved for future purposes. Escape it if you need to use this character in nexl expression', this.action.actionId, this.nexlExpressionMD.str);
};

NexlExpressionEvaluator.prototype.init = function (actionNr) {
	this.actionsAsString = [];
	this.needDeepResolution4NextActions = true;
	this.this = this.objInfo.this;
	this.lastObjResult = undefined;

	// if there is no actions, the result is undefined
	if (this.nexlExpressionMD.actions.length - 1 < actionNr) {
		this.result = undefined;
		return;
	}

	// retrieving first action
	var action = this.nexlExpressionMD.actions[actionNr];

	// if first action is PROPERTY_RESOLUTION, result is assigning to context, otherwise to undefined
	if (action.actionId === nexlExpressionsParser.ACTIONS.PROPERTY_RESOLUTION) {
		this.result = this.context;
	} else {
		this.result = undefined;
	}
};


NexlExpressionEvaluator.prototype.expandObjectKeys = function () {
	// not relevant for standard libraries
	if (this.result === Math || this.result === Number || this.result === Date || this.result == this.context) {
		return;
	}

	var objInfo = this.makeObjInfo();
	var nexlEngine = new NexlEngine(this.context, this.isEvaluateToUndefined);

	for (var key in this.result) {
		// nexilized key
		var newKey = nexlEngine.processItem(key, objInfo);

		if (newKey === undefined) {
			delete this.result[key];
			continue;
		}

		// key must be a primitive. checking...
		if (!j79.isPrimitive(newKey)) {
			throw util.format('Cannot assemble JavaScript object. The [%s] key is evaluated to a non-primitive data type %s', key, j79.getType(newKey));
		}

		// same key ? nothing changed
		if (newKey == key) {
			continue;
		}

		// deleting old key and assigning the new key
		var value = this.result[key];
		delete this.result[key];
		this.result[newKey] = value;
	}
};

NexlExpressionEvaluator.prototype.makeObjInfo = function () {
	return {
		this: this.objInfo.this,
		parent: this.objInfo.parent,
		item: this.objInfo.item, // array element in iteration
		index: this.objInfo.index, // array index in iteration
		key: this.objInfo.key, // key in object iteration
		value: this.objInfo.value // value in object iteration
	};
};

NexlExpressionEvaluator.prototype.makeDeepResolution = function () {
	if (!this.needDeepResolution4NextActions) {
		return;
	}

	var objInfo = this.makeObjInfo();
	objInfo.this = this.lastObjResult;
	objInfo.parent = this.lastObjResult === undefined ? this.objInfo.parent : this.lastObjResult[PARENT];

	this.result = new NexlEngine(this.context, this.isEvaluateToUndefined).processItem(this.result, objInfo);
};

NexlExpressionEvaluator.prototype.strigifySafely = function (what) {
	try {
		return JSON.stringify(what);
	} catch (e) {
		logger.error('Failed to stringify result. Error message : ' + e);
		return 'ERROR !';
	}
};

NexlExpressionEvaluator.prototype.strigifyResult = function () {
	if (this.result === this.context) {
		return 'undefined';
	}

	return this.strigifySafely(this.result);
};

NexlExpressionEvaluator.prototype.logBefore = function () {
	if (!j79.isLogLevel('debug')) {
		return;
	}

	var actionValue = '';

	if (this.action.actionValue && this.action.actionValue.chunks && this.action.actionValue.chunks.length > 0) {
		actionValue = 'still not calculated';
	} else {
		actionValue = this.action.actionValue;
	}

	if (j79.isLogLevel('silly')) {
		logger.debug('>> Evaluating [%s] action, [actionId=\'%s\'], [actionValue=%s], [actionNr=%s/%s], [resultBefore=%s]', nexlExpressionsParser.ACTIONS_DESC[this.action.actionId], this.action.actionId, actionValue, ( this.actionNr + 1 ), this.nexlExpressionMD.actions.length, this.strigifyResult());
	} else {
		logger.debug('>> Evaluating [%s] action, [actionId=\'%s\'], [actionValue=%s], [actionNr=%s/%s]', nexlExpressionsParser.ACTIONS_DESC[this.action.actionId], this.action.actionId, actionValue, ( this.actionNr + 1 ), this.nexlExpressionMD.actions.length);
	}
};

NexlExpressionEvaluator.prototype.logAfter = function () {
	if (j79.isLogLevel('silly')) {
		logger.debug('<< The [%s] action is evaluated, [actionId=\'%s\'], [actionNr=%s/%s], [resultAfter=%s]', nexlExpressionsParser.ACTIONS_DESC[this.action.actionId], this.action.actionId, ( this.actionNr + 1 ), this.nexlExpressionMD.actions.length, this.strigifyResult());
	} else {
		logger.debug('<< The [%s] action is evaluated, [actionId=\'%s\'], [actionNr=%s/%s]', nexlExpressionsParser.ACTIONS_DESC[this.action.actionId], this.action.actionId, ( this.actionNr + 1 ), this.nexlExpressionMD.actions.length);
	}
};

NexlExpressionEvaluator.prototype.eval = function () {
	this.init(0);
	this.retrieveEvaluateToUndefinedAction();

	logger.debug('-->> Evaluating [expression=%s]. This expression has [%s] action(s). Iterating over actions', this.nexlExpressionMD.str, this.nexlExpressionMD.actions.length);

	// iterating over actions
	for (this.actionNr = 0; this.actionNr < this.nexlExpressionMD.actions.length; this.actionNr++) {
		// current action
		this.action = this.nexlExpressionMD.actions[this.actionNr];

		this.logBefore();
		this.applyAction();
		this.logAfter();

		// if last action is evaluated to object and current result is not context, save this.result
		if (j79.isObject(this.result) && this.result !== this.context) {
			this.this = this.result;
			this.lastObjResult = this.result;
		}
	}

	this.makeDeepResolution();

	if (j79.isLogLevel('silly')) {
		logger.debug('<<-- Finished evaluating [expression=%s] with [%s] action(s). [finalResult=%s]', this.nexlExpressionMD.str, this.nexlExpressionMD.actions.length, this.strigifyResult());
	} else {
		logger.debug('<<-- Finished evaluating [expression=%s] with [%s] action(s)', this.nexlExpressionMD.str, this.nexlExpressionMD.actions.length);
	}

	return this.result;
};

function NexlExpressionEvaluator(context, nexlExpressionMD, objInfo) {
	this.context = context;
	this.nexlExpressionMD = nexlExpressionMD;
	this.objInfo = objInfo;

	this.funcParamsStack = [];
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// NexlEngine
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


NexlEngine.prototype.processArrayItem = function (arr, objInfo) {
	var arrCopy = arr.concat();
	arr.length = 0;

	for (var index in arrCopy) {
		var arrItem = arrCopy[index];
		var item = this.processItem(arrItem, objInfo);

		if (j79.isArray(item)) {
			arr.push.apply(arr, item);
		} else {
			arr.push(item);
		}
	}

	return arr;
};


NexlEngine.prototype.processObjectItem = function (obj, objInfo) {
	var parent = obj[PARENT] === undefined ? objInfo.parent : obj[PARENT];
	nexlEngineUtils.setReadOnlyProperty(obj, PARENT, parent);

	// result keys
	var keys = Object.keys(obj);

	// this object info is applied for sub objects
	var parent4Objects = {
		parent: obj
	};

	// this object info is applied for non object, for example for strings
	var parent4Others = {
		this: obj,
		parent: obj[PARENT]
	};

	// iterating over over keys and evaluating
	for (var index in keys) {
		var key = keys[index];
		var evaluatedKey = this.processItem(key, parent4Others);

		// !U MISCELLANEOUS_OPERATIONS
		if (evaluatedKey === undefined) {
			delete obj[key];
			continue;
		}

		// key must be a primitive. validating
		if (!j79.isPrimitive(evaluatedKey)) {
			throw util.format('Cannot assemble JavaScript object. The [%s] key is evaluated to a non-primitive data type %s', key, j79.getType(evaluatedKey));
		}

		var value = obj[key];

		// has got new key ? delete the old one
		if (key != evaluatedKey) {
			delete obj[key];
		}

		value = this.processItem(value, j79.isObject(value) ? parent4Objects : parent4Others);
		obj[evaluatedKey] = value;
	}

	return obj;
};

NexlEngine.prototype.processStringItem = function (str, objInfo) {
	// parsing string
	var parsedStrMD = nexlExpressionsParser.parseStr(str);

	var data = {};
	data.chunks = parsedStrMD.chunks;
	data.chunkSubstitutions = parsedStrMD.chunkSubstitutions;
	data.str = str;
	data.objInfo = objInfo;

	// evaluating
	return new EvalAndSubstChunks(this.context, this.isEvaluateToUndefined, data).evalAndSubstChunks();
};

NexlEngine.prototype.processItem = function (item, aObjInfo) {
	var objInfo = aObjInfo || {};

	// iterates over each array element and processes every item
	if (j79.isArray(item)) {
		return this.processArrayItem(item, objInfo);
	}

	// iterates over object keys and values and processes them
	if (j79.isObject(item)) {
		return this.processObjectItem(item, objInfo);
	}

	// not supported !
	if (j79.isFunction(item)) {
		return item;
	}

	// actually the only string elements are really being processed
	if (j79.isString(item)) {
		return this.processStringItem(item, objInfo);
	}

	// all another primitives are not processable and being returned as is
	return item;
};

function NexlEngine(context, isEvaluateToUndefined) {
	this.context = context;
	this.isEvaluateToUndefined = isEvaluateToUndefined;
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// exports
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports.nexlize = function (nexlSource, item, externalArgs) {
	if (j79.isLogLevel('debug')) {
		logger.debug('nexlizing... [nexl-source=%s], [item=%s], [externalArgs=%s]', JSON.stringify(nexlSource), JSON.stringify(item), JSON.stringify(externalArgs));
	}

	// creating context
	var context = nexlEngineUtils.createContext(nexlSource, externalArgs, NexlEngine);

	// replacing \n and \t with their real ASCII code
	var item2Process = nexlEngineUtils.replaceSpecialChars(item);

	// should item be evaluated to undefined if it contains undefined variables ?
	var isEvaluateToUndefined = nexlEngineUtils.hasEvaluateToUndefinedFlag(context);

	// is item not specified, using a default nexl expression
	if (item2Process === undefined) {
		item2Process = context.nexl.defaultExpression;
		logger.debug('applying defaultExpression for item which was undefined. [defaultExpression=%s]', item2Process);
	}

	// running nexl engine
	return new NexlEngine(context, isEvaluateToUndefined).processItem(item2Process);
};

// meta data parser
module.exports.parseMD = mdParser.parseMD;

// separates string items by dots ( if not escaped ) and puts them into nested objects
module.exports.handleArgs = nexlEngineUtils.handleArgs;

module.exports.nexlFuncs = require('./nexl-functoins').nexlFuncs;

module.exports.setLogger = function (aLogger) {
	require('./logger').setLogger(aLogger);
	logger = aLogger;

	nexlEngineUtils.reloadLoggerInstance();
	nexlExpressionsParser.reloadLoggerInstance();
	nexlSourceUtils.reloadLoggerInstance();
};

module.exports.OPERATIONS_ESCAPED = nexlExpressionsParser.OPERATIONS_ESCAPED;
