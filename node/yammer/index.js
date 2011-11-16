var settings = require('../utils/Settings');
var request = require('request');
var retry = require('retry');
var log4js = require('log4js');
var runtimeLog = log4js.getLogger('runtimeLog');
var httpLog = log4js.getLogger('httpLog');

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
      , opts = null;

    if(!wf) { return callback(new Error('Cannot activate page. No workfeed configuration'), false); }

    if(!authToken || typeof authToken != 'string') {
      return callback(new Error('Cannot activate page. Invalid authToken: ' + authToken), false);
    }

    op = retry.operation({
        retries: 2 // 3 retries
        , factor: 10 // backoff by factors of 10
        , minTimeout: 100 // wait at least 100 ms between retries
        , maxTimeout: 1000 // max time between retries
        , randomize: false // don't randomize times
      });

    opts = {
      url: wf.host + 
        (wf.port ? ':' + wf.port : '') +
        (wf.pathPrefix || '') + '/pages'
        + '/' + this.getYammerId(pad.id) + '/activate.json'
      , headers: {
        Host: 'paddie'
        , 'Content-Type': 'application/javascript'
        , Authorization: 'Bearer ' + authToken
      }
    }

    runtimeLog.info('Activating page ' + pad.id);
    op.attempt(function(tries) {
      if(tries > 1) {
        runtimeLog.debug('... retrying activation of ' + pad.id);
      }

      request.put(opts, function(err, res, data) {
        var status = res ? res.statusCode : 0;

        httpLog.info('CLIENT_REQUEST ' + opts.url + ' ' + status );
        // done retrying
        if(!err && status >= 200 && status < 300) {
          runtimeLog.info('Activated ' + pad.id);
          return callback(null, true);
        } else {
          // maybe retry
          var expectRetry = err ||
              new Error('request failed: ' + status);
          if(op.retry(expectRetry)) { return; }

          err = op.mainError();
          runtimeLog.error('Failed to activate ' + pad.id + '.');

          return callback(err, false);
        }
      });
    });

    // if we got here, the request is in flight
    return true;
  }
}