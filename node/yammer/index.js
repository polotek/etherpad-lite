var settings = require('../utils/Settings');
var request = require('request');
var retry = require('retry');
var runtimeLog = require('log4js').getLogger('runtimeLog');

exports.Pages = {
  getYammerId: function(padId) {
    padId = padId ? padId + '' : '';
    var pos = padId.lastIndexOf('-');
    return padId.substring(pos+1);
  }
  /**
   * Alert workfeed that this pad should be activated
   * @param  {String} authToken - oauth2 token form WF
   */
  , activate: function(pad, authToken, callback) {
    var wf = settings.workfeed
      , op = null
      , url = null;

    if(!wf) { return callback(new Error('Cannot activate page. No workfeed configuration')); }

    op = retry.operation({
        retries: 2 // 3 retries
        , factor: 10 // backoff by factors of 10
        , minTimeout: 100 // wait at least 100 ms between retries
        , maxTimeout: 1000 // max time between retries
        , randomize: false // don't randomize times
      });

    url = wf.host + 
        (wf.port ? ':' + wf.port : '') +
        (wf.pathPrefix || '') + '/pages'
        + '/' + this.getYammerId(pad.id) + '/activate.json'

    runtimeLog.info('Activating page ' + pad.id);
    op.attempt(function(tries) {
      if(tries > 1) {
        runtimeLog.debug('... retrying activation of ' + pad.id);
      }

      request.post(url, function(err, res, data) {
        var status = res.statusCode;

        // done retrying
        if(status >= 200 && status < 300) {
          return callback(null, true);
        } else {
          // maybe retry
          var expectRetry = err ||
              new Error('request failed: ' + status);
          if(op.retry(expectRetry)) { return; }

          err = op.mainError();
          runtimeLog.error('Failed to activate ' + pad.id + '. ' + err.message);

          return callback(err, false);
        }
      });
    });
  }
}
