// One shared request/result; failed optional resources retry only on a later caller.
export function createRetryableResource(load, {now=Date.now, retryMs=30000, timeoutMs=10000}={}) {
  let shared=null, retryAt=0, failure;
  return function read() {
    if(shared)return shared;
    if(now()<retryAt)return Promise.reject(failure);
    const controller=new AbortController();let timer;
    const request=Promise.race([
      Promise.resolve().then(()=>load(controller.signal)),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("Resource timeout"));},timeoutMs);})
    ]).catch(error=>{
      if(shared===request){shared=null;retryAt=now()+retryMs;failure=error;}
      throw error;
    }).finally(()=>clearTimeout(timer));
    shared=request;
    return request;
  };
}
