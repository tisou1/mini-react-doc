/**
 * 类组件的公共实例接口；更新队列、state 合并和生命周期由 renderer 管理。
 * 实例可跨 render 复用，但 props/state 的正式发布与回调要等 commit。
 */
/** Component 为用户类提供 props/context/state 与请求更新的方法。 */
export class Component {
  constructor(props, context) {
    this.props = props;
    this.context = context;
    this.state = null;
    this.refs = {};
    // 挂载时由 renderer 注入；组件层只提交更新请求，不直接合并或渲染。
    this.__updater = null;
  }

  /** 排队对象或函数形式的部分 state；renderer 合并结果，commit 后执行 callback。 */
  setState(partialState, callback) {
    this.__updater?.(partialState, callback, false);
  }

  /** 请求跳过当前类组件的更新比较；仍由 renderer 协调子树，而非直接操作 DOM。 */
  forceUpdate(callback) {
    this.__updater?.(null, callback, true);
  }
}

// renderer 使用原型标记识别类组件，无需运行构造函数来猜测组件类型。
Component.prototype.isReactComponent = {};

// renderer 根据此标记对 props / state 进行浅比较。
/** PureComponent 复用 Component 接口，用第一层 Object.is 比较减少相同输入的 render。 */
export class PureComponent extends Component {}
PureComponent.prototype.isPureReactComponent = true;
