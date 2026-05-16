/* @refresh reload */
import { render } from 'solid-js/web';

import BootstrapApp from './app/BootstrapApp';
import { locale } from './shared/i18n';
import {
  assertStartupDomIntegrity,
  getStartupDom,
  removeBootSplash,
  waitForStartupUiReady,
} from './app/startup-dom';
import './index.css';

const { root, bootSplash } = getStartupDom();
assertStartupDomIntegrity(root, bootSplash);

const startupUiReady = waitForStartupUiReady();

render(() => <BootstrapApp />, root);

void startupUiReady
  .then(() => {
    removeBootSplash();
  })
  .catch((error) => {
    console.error(locale.errors.startupHandoffFailed, error);
  });
