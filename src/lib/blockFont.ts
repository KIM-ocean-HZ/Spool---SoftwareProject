// 正文字号（2026-08-27, Ocean:「给 block 的字体做一个大中小三个档位可选，其他文本渲染不做」）。
//
// 「其他文本渲染不做」是这个文件存在的全部理由：档位只改**块自己那几行字**——批注、正文、
// 摊开编辑时的两个输入框，以及压缩前原文那一块。侧边栏、刻度、菜单、设置页一个像素都不动。
// 所以它不是一个全局缩放（那是 webview 的 zoom，会把整扇窗一起放大），而是两个 token。
//
// ⚠️ 和 lib/theme.ts 同一个形状，也同一个理由：写在 <html> 上的一个属性。它 imports 什么都
// 不引，settingsStore 要拿默认值和校验器，反过来引回去就是一个在 store 构造期求值的环。
// ⚠️ 两个 token 而不是一个缩放系数：块里本来就有两级字（正文 15 / 批注·引文 13），一个系数
// 会把这个层级也一起缩放掉，小档下第二级会掉到读不动。

export type BlockFontSize = 'small' | 'medium' | 'large';

/** 设置里从左到右画的顺序。中 = 已发布版本的字号，放在中间，也是默认。 */
export const BLOCK_FONT_SIZES: readonly BlockFontSize[] = ['small', 'medium', 'large'] as const;

export const DEFAULT_BLOCK_FONT: BlockFontSize = 'medium';

export const isBlockFontSize = (v: unknown): v is BlockFontSize =>
  v === 'small' || v === 'medium' || v === 'large';

/** settings.json 是可以手改的，认不出来的值要退回「中」——退回一个没有字号的页面就成了白屏。 */
export const blockFontOrDefault = (v: unknown): BlockFontSize =>
  isBlockFontSize(v) ? v : DEFAULT_BLOCK_FONT;

/** CSS 选的那个属性名。写在这儿而不是散在两处，免得和 tokens.css 走散。 */
export const BLOCK_FONT_ATTR = 'data-block-font';

/** 放到 <html> 上。⚠️ `medium` 也照写不误，理由和 applyTheme 那边一样：属性在，才分得出
 *  「用户选了中」和「设置还没读进来」，而 app 启动时正好要穿过第二种状态。 */
export const applyBlockFont = (size: BlockFontSize, root: Element): void => {
  root.setAttribute(BLOCK_FONT_ATTR, size);
};
