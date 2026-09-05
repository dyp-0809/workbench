import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

function Chart({ option, height = 240 }) {
  const container = useRef(null);
  useEffect(() => {
    if (!container.current) return undefined;
    const chart = echarts.init(container.current);
    chart.setOption(option);
    const resize = () => chart.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container.current);
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); chart.dispose(); };
  }, [option]);
  return <div ref={container} style={{ width: '100%', minWidth: 0, height }} />;
}

function donutOption(data, palette, options = {}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const formatLegend = options.legendFormatter || ((item) => `${item.name} ${item.value}`);
  return { color: palette, tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' }, legend: { bottom: 0, textStyle: { color: '#8993b4', fontSize: 11 }, formatter: (name) => { const item = data.find((entry) => entry.name === name); return item ? formatLegend(item, total) : name; } }, graphic: [{ type: 'text', left: 'center', top: '34%', style: { text: String(total), fill: '#8993b4', fontSize: 22, fontWeight: 700 } }], series: [{ type: 'pie', radius: ['52%', '72%'], center: ['50%', '42%'], label: { show: false }, data }] };
}

export { Chart, donutOption };
