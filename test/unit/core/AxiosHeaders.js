var AxiosHeaders = require('../../../lib/core/AxiosHeaders');
var assert = require('assert');


describe('AxiosHeaders', function () {
  it('should support headers argument', function () {
    var headers = new AxiosHeaders({
      x: 1,
      y: 2
    });

    assert.strictEqual(headers.get('x'), '1');
    assert.strictEqual(headers.get('y'), '2');
  })


  describe('set', function () {
    it('should support adding a single header', function(){
      var headers = new AxiosHeaders();

      headers.set('foo', 'bar');

      assert.strictEqual(headers.get('foo'), 'bar');
    })

    it('should support adding multiple headers', function(){
      var headers = new AxiosHeaders();

      headers.set({
        foo: 'value1',
        bar: 'value2',
      });

      assert.strictEqual(headers.get('foo'), 'value1');
      assert.strictEqual(headers.get('bar'), 'value2');
    })

    it('should not rewrite header the header if the value is false', function(){
      var headers = new AxiosHeaders();

      headers.set('foo', 'value1');

      headers.set('foo', 'value2', false);

      assert.strictEqual(headers.get('foo'), 'value1');

      headers.set('foo', 'value2');

      assert.strictEqual(headers.get('foo'), 'value2');

      headers.set('foo', 'value3', true);

      assert.strictEqual(headers.get('foo'), 'value3');
    });

    it('should not rewrite the header if its value is false, unless rewrite options is set to true', function(){
      var headers = new AxiosHeaders();

      headers.set('foo', false);
      headers.set('foo', 'value2');

      assert.strictEqual(headers.get('foo'), false);

      headers.set('foo', 'value2', true);

      assert.strictEqual(headers.get('foo'), 'value2');
    })
  });

  describe('get', function () {
    describe('filter', function() {
      it('should support RegExp', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        assert.strictEqual(headers.get('foo', /^bar=(\w+)/)[1], 'value1');
        assert.strictEqual(headers.get('foo', /^foo=/), null);
      });

      it('should support function', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        assert.strictEqual(headers.get('foo', (value, header) => {
          assert.strictEqual(value, 'bar=value1');
          assert.strictEqual(header, 'foo');
          return value;
        }), 'bar=value1');
        assert.strictEqual(headers.get('foo', () => false), false);
      });
    });
  });

  describe('has', function () {
    it('should return true if the header is defined, otherwise false', function () {
      const headers = new AxiosHeaders();

      headers.set('foo', 'bar=value1');

      assert.strictEqual(headers.has('foo'), true);
      assert.strictEqual(headers.has('bar'), false);
    });

    describe('filter', function () {
      it('should support RegExp', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        assert.strictEqual(headers.has('foo', /^bar=(\w+)/), true);
        assert.strictEqual(headers.has('foo', /^foo=/), false);
      });

      it('should support function', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        assert.strictEqual(headers.has('foo', (value, header, headers)=> {
          assert.strictEqual(value, 'bar=value1');
          assert.strictEqual(header, 'foo');
          return true;
        }), true);
        assert.strictEqual(headers.has('foo', ()=> false), false);
      });

      it('should support string pattern', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        assert.strictEqual(headers.has('foo', 'value1'), true);
        assert.strictEqual(headers.has('foo', 'value2'), false);
      });
    });
  });

  describe('delete', function () {
    it('should delete the header', function () {
      const headers = new AxiosHeaders();

      headers.set('foo', 'bar=value1');

      assert.strictEqual(headers.has('foo'), true);

      headers.delete('foo');

      assert.strictEqual(headers.has('foo'), false);
    });

    it('should return true if the header has been deleted, otherwise false', function () {
      const headers = new AxiosHeaders();

      headers.set('foo', 'bar=value1');

      assert.strictEqual(headers.delete('bar'), false);

      assert.strictEqual(headers.delete('foo'), true);
    });

    it('should support headers array', function () {
      const headers = new AxiosHeaders();

      headers.set('foo', 'x');
      headers.set('bar', 'y');
      headers.set('baz', 'z');

      assert.strictEqual(headers.delete(['foo', 'baz']), true);

      assert.strictEqual(headers.has('foo'), false);
      assert.strictEqual(headers.has('bar'), true);
      assert.strictEqual(headers.has('baa'), false);
    });

    describe('filter', function () {
      it('should support RegExp', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        assert.strictEqual(headers.has('foo'), true);

        headers.delete('foo', /baz=/);

        assert.strictEqual(headers.has('foo'), true);

        headers.delete('foo', /bar=/);

        assert.strictEqual(headers.has('foo'), false);
      });

      it('should support function', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        headers.delete('foo', (value, header)=> {
          assert.strictEqual(value, 'bar=value1');
          assert.strictEqual(header, 'foo');
          return false;
        });

        assert.strictEqual(headers.has('foo'), true);

        assert.strictEqual(headers.delete('foo', ()=> true), true);

        assert.strictEqual(headers.has('foo'), false);
      });

      it('should support string pattern', function () {
        const headers = new AxiosHeaders();

        headers.set('foo', 'bar=value1');

        assert.strictEqual(headers.has('foo'), true);

        headers.delete('foo', 'baz');

        assert.strictEqual(headers.has('foo'), true);

        headers.delete('foo', 'bar');

        assert.strictEqual(headers.has('foo'), false);
      });
    });
  });

  describe('toJSON', function () {
    it('should return headers object with original headers case', function () {
      const headers = new AxiosHeaders({
        Foo: 'x',
        bAr: 'y'
      });

      assert.deepStrictEqual({...headers.toJSON()}, {
        Foo: 'x',
        bAr: 'y'
      });
    });
  });

  describe('accessors', function () {
    it('should support get accessor', function () {
      const headers = new AxiosHeaders({
        foo: 1
      });

      headers.constructor.accessor('foo');

      assert.strictEqual(typeof headers.getFoo, 'function');
      assert.strictEqual(headers.getFoo(), '1');
    });

    it('should support set accessor', function () {
      const headers = new AxiosHeaders({
        foo: 1
      });

      headers.constructor.accessor('foo');

      assert.strictEqual(typeof headers.setFoo, 'function');
      headers.setFoo(2);
      assert.strictEqual(headers.getFoo(), '2');
    });

    it('should support has accessor', function () {
      const headers = new AxiosHeaders({
        foo: 1
      });

      headers.constructor.accessor('foo');

      assert.strictEqual(typeof headers.hasFoo, 'function');
      assert.strictEqual(headers.hasFoo(), true);
    });
  });

  it('should be caseless', function () {
    const headers = new AxiosHeaders({
      fOo: 1
    });

    assert.strictEqual(headers.get('Foo'), '1');
    assert.strictEqual(headers.get('foo'), '1');

    headers.set('foo', 2);

    assert.strictEqual(headers.get('foO'), '2');
    assert.strictEqual(headers.get('fOo'), '2');

    assert.strictEqual(headers.has('fOo'), true);

    headers.delete('FOO');

    assert.strictEqual(headers.has('fOo'), false);

  });

  describe('normalize()', function () {
    it('should support auto-formatting', function () {
      const headers = new AxiosHeaders({
        fOo: 1,
        'x-foo': 2,
        'y-bar-bAz': 3
      });

      assert.deepStrictEqual({...headers.normalize(true).toJSON()}, {
        Foo: '1',
        'X-Foo': '2',
        'Y-Bar-Baz': '3'
      });
    });

    it('should support external defined values', function () {
      const headers = new AxiosHeaders({
        foo: '1'
      });

      headers['Foo'] = 2;

      headers['bar'] = 3;

      assert.deepStrictEqual({...headers.normalize().toJSON()}, {
        foo: '2',
        bar: '3'
      });
    });
  });
});