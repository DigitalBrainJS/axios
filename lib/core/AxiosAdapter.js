const padArguments = (a, b) => {
  let l = a.length;

  if (!l) {
    return b || a;
  }

  const {length} = b;
  while (l < length) {
    a[l] = b[l++];
  }

  return a;
}

const compose = (handlers, next, reducer) => {
  const {length} = handlers;

  return function composed(...args) {
    let index = -1;

    const dispatch = async (i, dispatchArgs) => {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }

      const handler = (index = i) === length ? next : handlers[i];

      return handler ? handler.call(this, ...dispatchArgs, (...passedArgs) => {
        const reducedArgs = reducer && reducer.call(this, passedArgs) || passedArgs;
        return dispatch(i + 1, padArguments(reducedArgs, dispatchArgs))
      }) : undefined;
    }

    return dispatch(0, args);
  };
}


const run = compose([
  async (a, b, next)=> {
    console.log('handler 1:', a, b, next);
    return await next(890);
  },
  async (a, b, next)=> {
    console.log('handler 2:', a, b, next);
    return 'bar';
  }
], function myNextFn(...args) {
  console.log('myNextFn', args);
});

console.log('result:', await run(123, 456));

class AxiosAdapter {
  constructor() {
  }

  async request(config) {

  }

  async accept() {

  }

  async dispatch(config) {

  }

  static from(fn) {

  }

  static getAdapter(name) {

  }
}

AxiosAdapter.from(async (config) => {

});

class AxiosFetchAdapter extends AxiosAdapter {
  async accept(config) {
    throw AxiosError.Unsupported('protocol');
  }
}
