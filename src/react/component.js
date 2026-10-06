export class Component {
  constructor(props, context) {
    this.props = props;
    this.context = context;
    this.state = null;
    this.refs = {};
    // 挂载时由 renderer 注入；组件层只提交更新请求，不直接合并或渲染。
    this.__updater = null;
  }

  setState(partialState, callback) {
    this.__updater?.(partialState, callback, false);
  }

  forceUpdate(callback) {
    this.__updater?.(null, callback, true);
  }
}

Component.prototype.isReactComponent = {};

// renderer 根据此标记对 props / state 进行浅比较。
export class PureComponent extends Component {}
PureComponent.prototype.isPureReactComponent = true;
