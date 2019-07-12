// ## The JSONRPC constructor
// Each JSON-RPC object created is tied to a particular JSON-RPC server URL.
// This may be inconvenient for server architectures that have many URLs for
// each JSON-RPC server, but this is an odd use case we aren't implementing.
//
// The constructed JSON-RPC objects consist of three built-in methods:
//
// * request
// * register
//
// The *request* and *requestBlock* functions are the ones actually used to
// call the JSON-RPC server, and the *register* function constructs the expected
// function names to be used by the developer using this JSON-RPC client.

// The JSONRPC constructor *must* receive a server URL on initialization
function JSONRPC(transport, options, done) {
  this.transport = transport
  // Parse any *options* provided to the client
  // If no *options* object provided, create an empty one
  if(typeof(options) !== 'object' || options === null) {
    options = {}
  }
  //add custom request id generator if provided in options
  if(options.hasOwnProperty('idGenerator') && typeof(options.idGenerator) === 'function') {
    this.idGenerator = options.idGenerator
  }
  //default
  else this.idGenerator = function () {return Math.floor(Math.random() * 9999)}

  // *autoRegister* methods from the server unless explicitly told otherwise
  if(!options.hasOwnProperty('autoRegister') || options.autoRegister) {
    this.request('rpc.methodList', [], function(err, result) {
      if(!err) this.register(result)
      if(done) done(this)
    }.bind(this))
  }
  // Once the JSONRPC object has been properly initialized, return the object
  // to the developer
  return this
}

// ### The *request* function
// is a non-blocking function that takes an arbitrary number of arguments,
// where the first argument is the remote method name to execute, the last
// argument is the callback function to execute when the server returns its
// results, and all of the arguments in between are the values passed to the
// remote method.
JSONRPC.prototype.request = function(method, args, callback) {
  // The *contents* variable contains the JSON-RPC 1.0 POST string.
  const requestId = this.idGenerator()
  if(!requestId || requestId ===  null) {
    if(callback instanceof Function) {
      callback(new Error('Request id generator function should return an id'))
      return
    }
  }

  const contents = {
    method: method,
    params: args,
    id: requestId,
    jsonrpc: "2.0"
  }
  this.transport.request(contents, function(response) {
    if(!response && callback instanceof Function) {
      callback(new Error('Server did not return valid JSON-RPC response'))
      return
    }
    if(callback instanceof Function) {
      if (response instanceof Error){
        callback(response)
      } else if(response.error) {
        if(response.error.message) {
          const err = new Error(response.error.message)
          Object.keys(response.error).forEach(function(key) {
            if(key !== 'message') err[key] = response.error[key]
          })
          callback(err)
        } else if (typeof response.error === 'string') {
          callback(new Error(response.error))
        } else {
          callback(response.error)
        }
      } else {
        callback(undefined, response.result)
      }
    }
  })
}

// ### The *register* function
// is a simple blocking function that takes a method name or array of
// method names and directly modifies the client with classic Node-style
// callback functions
JSONRPC.prototype.register = function(methods) {
  if(!(methods instanceof Array)) {
    methods = [methods]
  }
  methods.forEach((method) => {
    if(method !== 'transport' && method !== 'request' && method !== 'register' && method !== 'shutdown') {
      this[method] = (...args) => {
        const callback = args.pop()
        this.request(method, args, callback)
      }
    }
  })
}

// ### The *registerPromise* function
// is a simple blocking function that takes a method name or array of
// method names and directly modifies the client with asynchronous functions
// that return promises
JSONRPC.prototype.registerPromise = function(methods) {
  if(!(methods instanceof Array)) {
    methods = [methods]
  }
  methods.forEach((method) => {
    if(method !== 'transport' && method !== 'request' && method !== 'register' && method !== 'shutdown') {
      this[method] = (...args) => new Promise((resolve, reject) => {
        const callback = (err, result) => {
          if (err) return reject(err)
          return resolve(result)
        }
        this.request(method, args, callback)
      })
    }
  })
}

// Cleanly shutdown the JSONRPC client
JSONRPC.prototype.shutdown = function(done) {
  this.transport.shutdown(done)
}

module.exports = JSONRPC
