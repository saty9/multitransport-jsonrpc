// Take a JSON object and transform it into a [Pascal string](http://en.wikipedia.org/wiki/String_%28computer_science%29#Length-prefixed) stored in a buffer.
// The length prefix is big-endian because DEATH TO THE LITTLE ENDIAN LILLIPUTIANS!
const formatMessage = (obj, eventEmitter) => {
  const str = JSON.stringify(obj) + "\n"
  const strlen = Buffer.byteLength(str)
  if (eventEmitter) eventEmitter.emit('outMessage', obj, strlen)
  const buf = new Buffer(strlen)
  //buf.writeUInt32BE(strlen, 0)
  buf.write(str, 0, strlen, 'utf8')
  return buf
}

// Since all messages start with a length prefix and the "current" message is the first in the buffers array,
// we can determine the message length just by the first buffer in the array. This technically assumes that
// a buffer is at least 4 bytes large, but that should be a safe assumption.
const getMessageLen = (buffers) => {
  let current = 0
  let accumulator = 0
  while (true) {
    if (buffers[current]) {
      new_line_loc = buffers[0].indexOf(10)
      if (new_line_loc >= 0) {
        return new_line_loc + accumulator
      } else {
        accumulator += buffers[current].length
        current += 1
      }
    } else {
      return 0
    }
  }
}

// Simple helper function that returns the minimum value from all values passed into it
const min = (...args) => args.reduce((curr, val) => val < curr ? val : curr, Infinity)

// Given an array of buffers, the message length, and the eventEmitter object (in case of error)
// try to parse the message and return the object it contains
const parseBuffer = (buffers, messageLen, eventEmitter) => {
  // Allocate a new buffer the size of the message to copy the buffers into
  // and keep track of how many bytes have been copied and what buffer we're currently on
  const buf = new Buffer(messageLen)
  let bytesCopied = 0
  let currBuffer = 0

  // Continue copying until we've hit the message size
  while (bytesCopied < messageLen) {

    // bytesToCopy contains how much of the buffer we'll copy, either the
    // "whole thing" or "the rest of the message".
    let bytesToCopy = 0

    // Since the first buffer contains the message length itself, it's special-cased
    // to skip those 4 bytes
    bytesToCopy = min(messageLen-bytesCopied, buffers[currBuffer].length)
    buffers[currBuffer].copy(buf, bytesCopied, 0, bytesToCopy)

    // Increment the number of bytes copied by how many were copied
    bytesCopied += bytesToCopy

    // If we're done, we have some cleanup to do; either appending the final chunk of the buffer
    // to the next buffer, or making sure that the array slice after the while loop is done
    // appropriately
    if (bytesCopied === messageLen) {
      if (buffers[currBuffer].length !== bytesToCopy + 1) {
        buffers[currBuffer] = buffers[currBuffer].slice(bytesToCopy + 1)
        currBuffer -= 1
        //if (buffers[currBuffer].length < 4 && buffers[currBuffer+1]) {
        //  buffers[currBuffer+1] = Buffer.concat([buffers[currBuffer], buffers[currBuffer+1]])
        //} else {
        //  currBuffer-- // Counter the increment below
        //}
      }
    }

    // Move on to the next buffer in the array
    currBuffer++
  }

  // Trim the buffers array to the next message
  buffers = buffers.slice(currBuffer)

  // Parse the buffer we created into a string and then a JSON object, or emit the parsing error
  try {
    let json_string = buf.toString()
    return [buffers, JSON.parse(json_string)]
  } catch (e) {
    eventEmitter.emit('babel', buf.toString())
    eventEmitter.emit('error', e)
  }
}


const createDataHandler = (self, callback) => {
  let buffers = [], bufferLen = 0, messageLen = 0, end_found = true
  return (data) => {
    if (!data) { return } // Should we emit some sort of error here?
    //if (buffers[buffers.length-1] && buffers[buffers.length-1].length < 4) {
    //  buffers[buffers.length-1] = Buffer.concat([buffers[buffers.length-1], data], buffers[buffers.length-1].length + data.length)
    //} else {
    //  buffers.push(data)
    //}
    buffers.push(data)
    bufferLen += data.length
    new_line_loc = data.indexOf(10)
    if (new_line_loc >= 0){
      messageLen = messageLen + new_line_loc
      end_found = true
    } else {
      messageLen += data.length
    }
    //let lastBuffer = buffers[buffers.length -1]
    if (end_found) {
      //buffers[buffers.length -1] = lastBuffer.slice(0,lastBuffer.length - 1)
      let result, obj
      while (messageLen && bufferLen >= messageLen && (result = parseBuffer(buffers, messageLen, self))) {
        buffers = result[0]
        let obj = result[1]
        self.emit('message', obj, messageLen)
        try {
          callback(obj)
        } catch (e) {
          process.nextTick(() => {
            throw e
          })
        }

        bufferLen = bufferLen - (messageLen + 1)
        messageLen = getMessageLen(buffers)
      }
    }
    end_found = false
  }
}

// Export the public methods
module.exports.formatMessage = formatMessage
module.exports.getMessageLen = getMessageLen
module.exports.parseBuffer = parseBuffer
module.exports.createDataHandler = createDataHandler
