/**
 * 依訪談定案的規則產生對話紀錄文章標題：日期 + 群組名稱 + 「Line群組對話
 * 紀錄」+「(第N篇)」序號，一律套用同一種格式，不管是不是當天第一篇、
 * 看板是不是被多個群組共用（原本第 1 篇、看板沒被共用時會省略群組名稱
 * 跟序號，使用者確認過改成永遠一致，方便閱讀時一眼判斷這是第幾篇、
 * 哪個群組的對話，見對話紀錄）。
 * date 須已經是呼叫端格式化好的字串（補零日期），這裡不做日期格式化。
 * @param {{date: string, groupName: string, sequenceNumber: number}} params
 * @returns {string}
 */
function buildDigestTitle(params) {
  return params.date + params.groupName + 'Line群組對話紀錄(第' + params.sequenceNumber + '篇)';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildDigestTitle: buildDigestTitle
  };
}
