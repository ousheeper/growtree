/** 极简事件总线：插件与宿主之间唯一的通信方式 */
(function () {
  const map = Object.create(null);
  window.Bus = {
    on(evt, fn) {
      (map[evt] = map[evt] || []).push(fn);
      return () => {
        map[evt] = (map[evt] || []).filter((f) => f !== fn);
      };
    },
    emit(evt, payload) {
      (map[evt] || []).slice().forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error('[bus]', evt, e);
        }
      });
    }
  };
})();
