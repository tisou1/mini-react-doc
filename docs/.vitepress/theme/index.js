import DefaultTheme from 'vitepress/theme';
import RenderWalkthrough from './RenderWalkthrough.vue';
import FiberWalkthrough from './FiberWalkthrough.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('RenderWalkthrough', RenderWalkthrough);
    app.component('FiberWalkthrough', FiberWalkthrough);
  },
};
