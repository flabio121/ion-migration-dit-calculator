export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/calculator/index.html", request.url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
