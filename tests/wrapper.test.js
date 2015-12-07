/* eslint func-names: 0 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.experiment;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var PouchStreamServer = require('../');
var PouchDB = require('pouchdb');

describe('Stream server', function() {
  var testDocs = {
    docs: [{_id: 'doc1'}, {_id: 'doc2'}],
  };

  var testDb = new PouchDB({
    name: 'testdb1',
    db: require('memdown'),
  });

  describe('options.wrapperFunctions', function() {
    it('denies all write requests via the bulk document API', function(done) {
      var wrappedBulkDocs = function(/* fn, stream */) {
        return function(docs, options, cb) {
          var unauthorizedErrors = docs.docs.map(function(doc) {
            return {id: doc._id, error: 'forbidden', reason: 'read-only db'};
          });

          cb(undefined, unauthorizedErrors);
        };
      };

      var server = PouchStreamServer({
        wrapperFunctions: {bulkDocs: wrappedBulkDocs}});

      server.dbs.add('db1', testDb);

      var stream = server.stream('db1');

      stream.once('data', function(data) {
        // [0, [undefined,
        //      [{id: 'doc1', error: 'forbidden', reason: 'read-only db'},
        //       {id: 'doc2', error: 'forbidden', reason: 'read-only db'}]]]
        var seq = data[0];
        var response = data[1];
        var error = response[0];
        var results = response[1];

        expect(seq).to.equal(0);
        expect(error).to.equal(undefined);
        expect(results).to.deep.equal(
          [
            {id: 'doc1', error: 'forbidden', reason: 'read-only db'},
            {id: 'doc2', error: 'forbidden', reason: 'read-only db'}]);

        done();
      });

      stream.write([0, 'db1', '_bulkDocs', [testDocs, {}]]);
    });
  });

  it('passes through to `db.bulkDocs`', function(done) {
    var wrappedBulkDocs = function(/* fn, stream */) {
      return function(docs, options, cb) {
        var db = this;

        db.bulkDocs(docs, options, function(err, results) {
          cb(err, results);
        });
      };
    };

    var server = PouchStreamServer({
      wrapperFunctions: {bulkDocs: wrappedBulkDocs}});

    server.dbs.add('db1', testDb);

    var stream = server.stream('db1');

    stream.once('data', function(data) {
      // [0, [undefined,
      //      [{ok: true, id: 'doc1', rev: '1-1234…'},
      //       {ok: true, id: 'doc2', rev: '1-4321…'}]]]
      var seq = data[0];
      var response = data[1];
      var error = response[0];
      var results = response[1];

      expect(seq).to.equal(0);
      expect(error).to.equal(undefined);
      expect(results[0]).to.include({ok: true, id: 'doc1'});
      expect(results[1]).to.include({ok: true, id: 'doc2'});

      done();
    });

    stream.write([0, 'db1', '_bulkDocs', [testDocs, {}]]);
  });
});
