import DefaultTheme from 'vitepress/theme';
import RenderWalkthrough from './RenderWalkthrough.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('RenderWalkthrough', RenderWalkthrough);
  },
};
