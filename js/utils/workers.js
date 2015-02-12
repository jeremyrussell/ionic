(function() {
ionic.workers = {};
// WORKER_SCRIPTS is filled in by the build system with files from js/workers/
ionic.WORKER_SCRIPTS = {};

// Instantiated ionic worker wrappers
var ionicWorkers = {};

var nextMessageId = 0;
function IonicWorker(worker) {
  var pendingResponses = {};

  function onRespond(id, ev, isError) {
    var callback = pendingResponses[id];
    if (callback) {
      callback(ev);
      delete pendingResponses[id];
    }
  }

  this.addEventListener = worker.addEventListener;

  this.send = function(data, callback) {
    var id = data.id || (data.id = nextMessageId++);
    data.baseUrl = (
      location.protocol + '//' +
      location.hostname +
      (location.port?':'+location.port:'') +
      location.pathname
    ).replace(/[^\/]+$/, '');

    worker.postMessage(data);

    if (callback) {
      pendingResponses[id] = callback;
    }
  };

  worker.onmessage = function(ev) {
    onRespond(ev.data.id, ev);
  };
}

ionic.workers.get = function(name) {

  // We lazily find worker support to make sure we only try to detect it after DOMReady
  if (typeof ionic.workers.nativeSupport === 'undefined') {
    // Expose this so we can set it to false during tests. Avoids workers being instantiated during
    // unit tests.
    ionic.workers.nativeSupport = true;
    try {
      new Worker(makeBlobUri(';'));
    } catch(e) {
      ionic.workers.nativeSupport = false;
    }
  }

  var script = ionic.WORKER_SCRIPTS[name];
  if (!script) {
    throw new Error('Worker ' + name + ' does not exist! Available workers: ' +
                    Object.keys(ionic.WORKER_SCRIPTS).join(', '));
  }
  if (ionicWorkers[name]) {
    return ionicWorkers[name];
  }

  //Create a new worker
  var worker;
  if (ionic.workers.nativeSupport) {
    worker = new Worker(makeBlobUri(script));
  } else {
    worker = makeFakeWorker(script);
  }

  return (ionicWorkers[name] = new IonicWorker(worker));
};

function makeFakeWorker(script) {
  function FakeWorker() {
    // The contents of `script` can redefine these
    var close = function(){};
    var onerror = function(){};
    var onmessage = function(){};

    // Define the public API for the worker
    var publicWorker = {
      onmessage: function(){}
    };

    // What's in `script` will use postMessage to send us a response
    var postMessage = function onPostMessage(data) {
      publicWorker.onmessage({ data: data });
    }
    publicWorker.postMessage = function(data) {
      // Make it so the message is posted asynchronously to the worker. This makes our fake worker
      // at least be async.
      setTimeout(function() {
        onmessage({ data: data });
      }, 0);
    };
    publicWorker.terminate = function() {
      listeners.length = 0;
      close();
    };
  }

  // Inject the contents of `script` into the above FakeWorker function
  var fakeWorkerString = FakeWorker.toString()
    // Get rid of the `function FakeWorker() {`
    .replace(/^.*?{/, '')
    // Replace the ending brace with our script then a return statement
    .replace(/}$/, script + ';\nreturn publicWorker;');

  var fakeWorkerFn = new Function(fakeWorkerString);

  return fakeWorkerFn();
}

function makeBlobUri(script) {
  var URL = window.URL || window.webkitURL;
  var BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
  var blob;
  try {
    blob = new Blob([script], { type: 'text/javascript' });
  } catch (e) {
    blob = new BlobBuilder();
    blob.append(script);
    blob = blob.getBlob();
  }
  return URL.createObjectURL(blob);
}

})();
