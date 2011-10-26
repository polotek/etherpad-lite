var metrics = require('metrics');

var _report = new metrics.Report()
  , _logger;

var _warningMeters = [
  'NULL_MESSAGE'
, 'NO_MESSAGE_TYPE'
, 'UNKNOWN_MESSAGE'
, 'SUGGEST_USER_NAME_NO_NEWNAME'
, 'SUGGEST_USER_NAME_NO_UNNAMED_ID'
, 'USER_INFO_UPDATE_NO_COLOR_ID'
, 'USER_CHANGES_BASE_REV'
, 'USER_CHANGES_NO_APOOL'
, 'USER_CHANGES_NO_CHANGESET'
, 'CHECKREP'
, 'CLIENT_READY_NO_TOKEN'
, 'CLIENT_READY_NO_PAD_ID'
, 'CLIENT_READY_NO_PROTOCOL_VERSION'
, 'CLIENT_READY_UNKNOWN_PROTOCOL_VERSION'
];

var _errorKey = function (name){ return 'error.' + name + '_METER'; }
var _warnKey  = function (name){ return 'warn.' + name + '_METER'; }

var _messageKey  = function (message){
  var type = message.type === 'CLIENT_READY' ? 'CLIENT_READY' :
    (message.data && message.data.type);
  return 'message.' + type;
}

var _meter = function (key){
  var m = _report.getMetric(key);
  if (!m){
    m = new metrics.Meter();
    _report.addMetric(key, m);
  }
  return m;
}

exports.warn = function (name, message){
  _meter(_warnKey(name)).mark();
}

exports.error = function (name, message){
  _meter(_errorKey(name)).mark();
}

exports.timer = function (key) {
  var m = _report.getMetric(key);
  if (!m){
    m = new metrics.Timer();
    _report.addMetric(key, m);
  }
  return m;
}

exports.histogram = function (ns) {
  var x = metrics.Histogram.createExponentialDecayHistogram(5000);
  _report.addMetric(ns, x);
  return x;
}

/**
 * Retrieve the JSON report
 */
exports.summary = function (){
  return _report.summary();
}

/**
 * Call on a message when it is received server side
 */
exports.ticMessage = function (message){
  // Don't do anything if we have already tic'd on the message
  if (message.__start){ return; }

  // Find the local timer instance or create one if it doesn't exist
  var timer = exports.timer(_messageKey(message));

  // Save off the current time that message was received
  message.__start = new Date().getTime();
}

/**
 * Call on a message when the message is finished processing
 */
exports.tocMessage = function (message){
  if (!message || !message.__start){ return; }

  var start = message.__start
    , ns = _messageKey(message);

  // if this timer was never started then something weird happened
  _report.getMetric(ns).update((new Date().getTime()) - start);
}

// Seed all metrics
//var _seed = (function (){
//  _warningMeters.forEach(function (item){
//    _meter(_warnKey(item));
//  });
//})();
