import { readFileSync, writeFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));
const chartPath = './kubernetes/helm/matchexec/Chart.yaml';
let chart = readFileSync(chartPath, 'utf8');
chart = chart.replace(/^version: .+$/m, `version: ${version}`);
chart = chart.replace(/^appVersion: .+$/m, `appVersion: "${version}"`);
writeFileSync(chartPath, chart);
console.log(`Updated Chart.yaml to version ${version}`);
