/* Decap CMS 当前草稿字段的安全读写助手。
 *
 * 原理：Decap v3 内部用 action type "DRAFT_CHANGE_FIELD" 修改草稿字段。
 * 该字符串是字面量（不会被压缩器改名），reducer 用 field.get("name") 定位字段，
 * 所以我们从 store 里取出字段的 Immutable 对象，再 dispatch 同样的 action 即可可靠写字段。
 * 相比直接操作 DOM/React 输入框，这种方式跨版本稳定、且能正确触发 UI 重渲染。
 *
 * 暴露：
 *   window.__diy365GetField(name) -> 当前字段值（数组/字符串/undefined）
 *   window.__diy365SetField(name, value) -> true/false（写入成功与否）
 *
 * 注意：仅在正在编辑某篇草稿（entryDraft 存在）时有效。
 */
(function () {
  if (!window.CMS || typeof CMS.getStore !== 'function') return;

  function getEntry() {
    try {
      var st = CMS.getStore().getState();
      return (st.entryDraft && st.entryDraft.get('entry')) || null;
    } catch (e) { return null; }
  }

  function getFieldObj(name) {
    var entry = getEntry();
    if (!entry) return null;
    try {
      var coll = entry.get('collection');
      var fields = CMS.getStore().getState().collections.get(coll);
      if (!fields) return null;
      fields = fields.get('fields');
      if (!fields) return null;
      return fields.find(function (f) { return f.get && f.get('name') === name; }) || null;
    } catch (e) { return null; }
  }

  window.__diy365GetField = function (name) {
    var entry = getEntry();
    if (!entry) return undefined;
    try {
      var data = entry.get('data');
      if (!data) return undefined;
      var v = data.get(name);
      if (v == null) return undefined;
      return (typeof v.toJS === 'function') ? v.toJS() : v;
    } catch (e) { return undefined; }
  };

  window.__diy365SetField = function (name, value) {
    var fieldObj = getFieldObj(name);
    if (!fieldObj) return false;
    try {
      CMS.getStore().dispatch({
        type: "DRAFT_CHANGE_FIELD",
        payload: { field: fieldObj, value: value, metadata: undefined, entries: undefined, i18n: undefined }
      });
      return true;
    } catch (e) {
      console.error('__diy365SetField failed', e);
      return false;
    }
  };
})();
