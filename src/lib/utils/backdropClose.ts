// 2026-08-20 Ocean 报的：「在设置里面划 deepseek 的模型名称会自动退出设置」。
//
// 病因不在设置页，在**每一个铺满屏幕的遮罩**上：它们都写着 `onClick={close}`，靠
// 「点到遮罩 = 想关掉」这个假设工作。而这个假设只在「按下和松开都在遮罩上」时成立。
//
// 用鼠标划选输入框里的文字时，很容易划出输入框、划出面板，**在遮罩上松手**——
// 浏览器把这一按一松算作一次 click，事件冒到遮罩，面板就关了，你划到一半的名字也没了。
// 输入框越窄、要选的文字越长，越容易撞上；模型名那一栏正好又窄又长。
//
// 修法：**记住这一次按下的时候在哪。** 只有「按下在遮罩上」并且「松开也在遮罩上」
// 才算一次关闭意图。从输入框里划出来的那一下，按下不在遮罩上，于是什么也不会发生。
//
// ⚠️ 只判 `e.target === e.currentTarget` 是不够的——那只说明松手在遮罩上，
// 而这个 bug 里松手**确实**在遮罩上。要判的是按下那一刻。
/** 只认「按下和松开都在遮罩上」这一种关闭意图。
 *
 *  写成普通工厂而不是 hook,是为了这段判断能被直接测——它是一段两行的状态机,
 *  而这个 bug 恰恰是那两行漏了一行造成的。组件里用 `useMemo` 兜一层保持身份稳定。 */
export const createBackdropClose = (
  close: () => void,
): {
  onMouseDown: (e: { target: unknown; currentTarget: unknown }) => void;
  onClick: (e: { target: unknown; currentTarget: unknown }) => void;
} => {
  let startedOnBackdrop = false;
  return {
    onMouseDown: (e) => {
      startedOnBackdrop = e.target === e.currentTarget;
    },
    onClick: (e) => {
      if (e.target === e.currentTarget && startedOnBackdrop) close();
      startedOnBackdrop = false;
    },
  };
};
