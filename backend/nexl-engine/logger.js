var logger = require('winston');

module.exports.setLogger = function (aLoger) {
	logger = aLoger;
};

module.exports.logger = function () {
	return logger;
};

module.isLogLevel = function (level) {
	return logger.levels[logger.level] >= logger.levels[level];
};
