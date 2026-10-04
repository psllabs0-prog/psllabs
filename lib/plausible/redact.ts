/**
 * Plausible `transformRequest` hook (plain browser JS, injected into the init
 * snippet). Confirmation and unsubscribe URLs carry tokens: on those pages, or
 * any URL with a token parameter, the query is dropped before the event leaves
 * the browser. Opaque ad references are removed from page and referrer URLs
 * before sharing with this analytics service. Fragments are never sent.
 */
export const PLAUSIBLE_TRANSFORM_REQUEST_JS =
  'function(p){try{var c=function(v){if(!v)return v;var x=new URL(v);if(/^\\/(unsubscribe|newsletter\\/confirm|api\\/marketing\\/unsubscribe)(\\/|$)/.test(x.pathname)||/[?&](token|t)=/.test(x.search)){x.search=""}x.searchParams.delete("oppref");x.hash="";return x.toString()};p.u=c(p.u);if(p.r)p.r=c(p.r)}catch(e){}return p}';

export const PLAUSIBLE_INIT_JS = `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init({transformRequest:${PLAUSIBLE_TRANSFORM_REQUEST_JS}})`;
