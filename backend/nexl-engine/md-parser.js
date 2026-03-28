/**************************************************************************************
 nexl-source metadata parse ( parses JavaScript files )

 Copyright (c) 2016-2020 Liam Ray
 License : Apache 2.0
 WebSite : http://www.nexl-js.com

 **************************************************************************************/

// todo: test with nexl-engine test sources
// todo: make tests for each source separately ( the real test )

/*
Expressions builder ( navigation bar )
- all expressions without operations
- default value @
- object operations ~ including eliminate operation
- array operations including join, including adding and elimination, including slicing
- string operations
- mandatory operation
 */

const esprima = require('esprima');
const nexlSourceUtils = require('./nexl-source-utils');
const j79 = require('j79-utils');

function resolveObjProps(item) {
	const result = [];
	item.properties.forEach(prop => {
		result.push(prop.key.name || prop.key.value);
	});
	return result;
}

function resolveObjectPropName(item) {
	if (item.property) {
		const prefix = resolveObjectPropName(item.object);
		const name = item.property.name;
		return (prefix && name) ? resolveObjectPropName(item.object) + '.' + name : undefined;
	}

	return item.name;
}

function resolveName(item) {
	if (item.name) {
		return item.name;
	}

	if (!item.property || !item.object) {
		return;
	}

	const name = resolveObjectPropName(item);

	// omitting nexl object
	return !name || name.indexOf('nexl.') === 0 ? undefined : name;
}

function resolveType(item) {
	return ({}).toString.call(item).match(/\s([a-zA-Z]+)/)[1];
}

function alreadyExists(md, item) {
	for (let index in md) {
		if (md[index].name === item.name) {
			return true;
		}
	}

	return false;
}

function pushMDItem(md, item) {
	if (alreadyExists(md, item)) {
		return;
	}

	if (item.name) {
		md.push(item);
	}
}

function resolveArgs(params) {
	const result = [];
	params.forEach(item => result.push(item.name));
	return result;
}

function handleExpressionStatement(item, result) {
	if (item.type !== 'ExpressionStatement') {
		return;
	}

	// is assignment expression ?
	if (item.type !== 'ExpressionStatement' || item.expression.type !== 'AssignmentExpression') {
		return;
	}

	// has any data ?
	if (!item.expression || !item.expression.left || !item.expression.right) {
		return;
	}

	// object
	if (item.expression.right.type === 'ObjectExpression') {
		pushMDItem(result, {
			name: resolveName(item.expression.left),
			keys: resolveObjProps(item.expression.right),
			type: 'Object'
		});
		return;
	}

	// array
	if (item.expression.right.type === 'ArrayExpression') {
		pushMDItem(result, {
			name: resolveName(item.expression.left),
			type: 'Array'
		});
		return;
	}

	// function
	if (item.expression.right.type === 'FunctionExpression' || item.expression.right.type === 'ArrowFunctionExpression') {
		pushMDItem(result, {
			name: resolveName(item.expression.left),
			type: 'Function',
			args: resolveArgs(item.expression.right.params)
		});
		return;
	}

	const element = {
		name: resolveName(item.expression.left),
		type: resolveType(item.expression.right.value)
	};

	if (element.name === undefined) {
		return;
	}

	if (element.type === 'Undefined' || element.type === 'Null') {
		delete element.type;
	}

	pushMDItem(result, element);
}

function handleVariableDeclaration(item, result) {
	if (item.type !== 'VariableDeclaration') {
		return;
	}

	if (!item.declarations || item.declarations.length !== 1 || !item.declarations[0].init) {
		return;
	}

	// is object ?
	if (item.declarations[0].init.type === 'ObjectExpression') {
		pushMDItem(result, {
			name: item.declarations[0].id.name,
			keys: resolveObjProps(item.declarations[0].init),
			type: 'Object'
		});
		return;
	}

	// is array ?
	if (item.declarations[0].init.type === 'ArrayExpression') {
		pushMDItem(result, {
			name: item.declarations[0].id.name,
			type: 'Array'
		});
		return;
	}

	// is function ?
	if (item.declarations[0].init.type === 'FunctionExpression' || item.declarations[0].init.type === 'ArrowFunctionExpression') {
		pushMDItem(result, {
			name: item.declarations[0].id.name,
			type: 'Function',
			args: resolveArgs(item.declarations[0].init.params)
		});
		return;
	}

	const element = {
		name: item.declarations[0].id.name,
		type: resolveType(item.declarations[0].init.value)
	};

	if (element.name === undefined) {
		return;
	}

	if (element.type === 'Undefined' || element.type === 'Null') {
		delete element.type;
	}

	pushMDItem(result, element);
}

function parseMD(source) {
	const fileContent = nexlSourceUtils.assembleSourceCode(source);

	const result = [];

	const parsed = esprima.parse(fileContent);
	parsed.body.forEach(item => {
		// is function declaration ?
		if (item.type === 'FunctionDeclaration') {
			pushMDItem(result, {
				name: item.id.name,
				type: 'Function',
				args: resolveArgs(item.params)
			});
		}

		handleExpressionStatement(item, result);
		handleVariableDeclaration(item, result);
	});

	return result;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// exports
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
module.exports.parseMD = parseMD;