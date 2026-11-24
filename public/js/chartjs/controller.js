const chartOptions = {
  chartType: "boxplot",
  xAxis: "city",
  yAxis: "price_per_sqft",
  pointColor: "city",
  binCount: 5,
};
let colorCounter = 0;
let chartData = {};
let chartInstance = null;
let mode = 'light';
let modeColor = 'black';

const selectOptions = [];

function initChartFeatures(features) {
  selectOptions.length = 0;
  features.forEach(function(feature) {
    selectOptions.push({ value: feature.column, label: feature.label });
  });
  selectOptions.push({ value: 'city', label: 'City' });
  chartOptions.yAxis = features[0].column;
  chartOptions.xAxis = 'city';
  chartOptions.pointColor = 'city';
  if (document.getElementById('xAxis')) {
    populateOptions('xAxis', selectOptions);
    populateOptions('yAxis', selectOptions);
    populateOptions('pointColor', selectOptions);
  }
}

$('document').ready(function(){
  detectColorScheme();
  addListeners();
  window.addEventListener('resize', function() {
    if (chartInstance) {
      positionAxisControls(chartInstance);
    }
  });
});

function detectColorScheme() {
  if (document.documentElement.classList.contains('browse-embed')) {
      mode = 'light';
      modeColor = '#222222';
      gridColor = 'rgba(7, 37, 137, 0.12)';
      return;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) {
      mode = 'dark';
      modeColor = 'white';
      gridColor = 'rgba(255,255,255,0.1)';
      var buttons = document.querySelectorAll('button');

      // Loop through the buttons to find and style links within them
      buttons.forEach(function(button) {
          // Select all <a> tags within the button
          var links = button.querySelectorAll('a');

          // Loop through the links within the button and set their color
          links.forEach(function(link) {
              link.style.color = modeColor;
          });
      });
      var cardBoxes = document.querySelectorAll('.cardbox');

      // Loop through the cardbox elements and set their border color
      cardBoxes.forEach(function(cardBox) {
          cardBox.style.borderColor = gridColor;
      });

      var cardBoxesThin = document.querySelectorAll('.cardbox-thin');

      // Loop through the cardbox elements and set their border color
      cardBoxesThin.forEach(function(cardBox) {
          cardBox.style.borderColor = gridColor;
      });

      var cardSets = document.querySelectorAll('.cardSet');

      // Loop through the cardbox elements and set their border color
      cardSets.forEach(function(cardSet) {
          cardSet.style.borderColor = gridColor;
      });

      var expandable = document.getElementsByClassName('expandable-box')[0];
      if (expandable) {
        expandable.style.borderColor = gridColor;
      }

  } else {
      mode = 'light';
      modeColor = 'black';
      gridColor = 'rgba(0,0,0,0.1)';
  }
}

function populateOptions(elementName, optionsList) {
  const selectElement = document.getElementById(elementName);
  if (!selectElement) return;
  selectElement.innerHTML = '';

  const selectedValue = chartOptions[elementName];
  var matched = false;

  (optionsList || []).forEach(function(option) {
      const optionElement = document.createElement('option');
      const optionValue = option.value || option.toLowerCase().replace(/ /g, '_');
      optionElement.value = optionValue;
      optionElement.text = option.label || option;

      if (optionValue === selectedValue) {
          optionElement.selected = true;
          matched = true;
      }

      selectElement.appendChild(optionElement);
  });

  if (!matched && selectElement.options.length) {
    selectElement.selectedIndex = 0;
    chartOptions[elementName] = selectElement.value;
  }

  if (!selectElement.getAttribute('data-bound')) {
      selectElement.addEventListener('change', function () {
        chartOptions[elementName] = this.value;
        renderChart();
      });
      selectElement.setAttribute('data-bound', 'yes');
  }
}

function axisOptionsFor(axisKey) {
  var type = chartOptions.chartType;
  return selectOptions.filter(function(option) {
    if (option.value !== 'city') {
      return true;
    }
    // City is the series colour on scatter/histogram — never also an axis
    if (type === 'scatter' || type === 'histogram') {
      return false;
    }
    // Boxplot already uses city on X; keep it off Y
    if (type === 'boxplot' && axisKey === 'yAxis') {
      return false;
    }
    return true;
  });
}

function axisFieldLabel(field) {
  for (var i = 0; i < selectOptions.length; i++) {
    if (selectOptions[i].value === field) {
      return selectOptions[i].label || field;
    }
  }
  if (field === 'city') return 'City';
  return field;
}

function formatChartNumber(value) {
  if (value === undefined || value === null || value === '' || Number.isNaN(Number(value))) {
    return String(value);
  }
  var n = Number(value);
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  if (Math.abs(n) >= 10) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function readableChartChrome() {
  var embed = document.documentElement.classList.contains('browse-embed');
  var textColor = embed ? '#222222' : modeColor;
  return {
    legend: {
      display: true,
      position: 'top',
      labels: {
        color: textColor,
        font: { size: 16, weight: '600' },
        padding: 16,
        boxWidth: 16,
        boxHeight: 16,
        usePointStyle: true
      }
    }
  };
}

function colorToRgba(color, alpha) {
  var fallback = 'rgba(7, 37, 137, ' + alpha + ')';
  if (!color) return fallback;
  var value = String(color).trim();
  var rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return 'rgba(' + rgbMatch[1] + ', ' + rgbMatch[2] + ', ' + rgbMatch[3] + ', ' + alpha + ')';
  }
  var hex = value.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return 'rgba(' +
    parseInt(hex.slice(0, 2), 16) + ', ' +
    parseInt(hex.slice(2, 4), 16) + ', ' +
    parseInt(hex.slice(4, 6), 16) + ', ' +
    alpha + ')';
}

function datasetSeriesColor(item) {
  if (!item || !item.dataset) return '#072589';
  var fill = item.dataset.backgroundColor;
  if (Array.isArray(fill)) fill = fill[0];
  return fill || item.dataset.borderColor || '#072589';
}

function tooltipTableHtml(rows) {
  return '<table class="chartjs-tooltip-table"><tbody>' +
    rows.map(function(row) {
      return '<tr' + (row.cls ? ' class="' + row.cls + '"' : '') + '>' +
        '<th scope="row">' + row.label + '</th>' +
        '<td>' + row.value + '</td></tr>';
    }).join('') +
    '</tbody></table>';
}

function positionChartTooltip(el, chart, tooltip) {
  var canvasRect = chart.canvas.getBoundingClientRect();
  var parentRect = chart.canvas.parentNode.getBoundingClientRect();
  var left = canvasRect.left - parentRect.left + tooltip.caretX;
  var top = canvasRect.top - parentRect.top + tooltip.caretY;
  var tipWidth = el.offsetWidth || 120;
  var tipHeight = el.offsetHeight || 80;
  var maxLeft = parentRect.width - tipWidth - 8;
  var maxTop = parentRect.height - tipHeight - 8;
  el.style.left = Math.max(8, Math.min(left + 12, maxLeft)) + 'px';
  el.style.top = Math.max(8, Math.min(top - tipHeight - 8, maxTop)) + 'px';
}

function showExternalChartTooltip(context, buildHtml) {
  var chart = context.chart;
  var tooltip = context.tooltip;
  var el = getChartTooltipEl(chart);

  if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
    el.style.opacity = '0';
    return;
  }

  var item = tooltip.dataPoints[0];
  el.innerHTML = buildHtml(item, tooltip);
  el.style.background = colorToRgba(datasetSeriesColor(item), 0.94);
  el.style.borderColor = 'rgba(255, 255, 255, 0.35)';
  el.style.opacity = '1';
  positionChartTooltip(el, chart, tooltip);
}

function quantileSorted(sorted, q) {
  if (!sorted.length) return null;
  var pos = (sorted.length - 1) * q;
  var base = Math.floor(pos);
  var rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function fiveNumberSummary(values) {
  var sorted = (values || []).filter(function(n) {
    return typeof n === 'number' && !Number.isNaN(n);
  }).slice().sort(function(a, b) {
    return a - b;
  });
  if (!sorted.length) return null;
  return {
    min: sorted[0],
    q1: quantileSorted(sorted, 0.25),
    median: quantileSorted(sorted, 0.5),
    q3: quantileSorted(sorted, 0.75),
    max: sorted[sorted.length - 1]
  };
}

function getChartTooltipEl(chart) {
  var parent = chart.canvas.parentNode;
  var el = parent.querySelector('.chartjs-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'chartjs-tooltip';
    el.style.opacity = '0';
    parent.appendChild(el);
  }
  return el;
}

function boxplotElementStats(tooltipItem) {
  var el = tooltipItem && tooltipItem.element;
  if (el && el.boxplot) return el.boxplot;
  if (el && el.$context && el.$context.raw && !Array.isArray(el.$context.raw)) {
    return el.$context.raw;
  }
  var fv = tooltipItem && tooltipItem.formattedValue;
  if (fv && typeof fv === 'object' && fv.raw && !Array.isArray(fv.raw)) {
    return fv.raw;
  }
  return null;
}

function boxplotHoveredPoint(tooltip, tooltipItem) {
  var stats = boxplotElementStats(tooltipItem) || {};
  var outlierMeta = tooltip && tooltip._tooltipOutlier;
  var itemMeta = tooltip && tooltip._tooltipItem;
  var fv = tooltipItem && tooltipItem.formattedValue;

  var outlierIndex = -1;
  var itemIndex = -1;

  if (outlierMeta && tooltipItem && outlierMeta.datasetIndex === tooltipItem.datasetIndex) {
    outlierIndex = outlierMeta.index;
  }
  if (itemMeta && tooltipItem && itemMeta.datasetIndex === tooltipItem.datasetIndex) {
    itemIndex = itemMeta.index;
  }
  if (fv && typeof fv === 'object') {
    if (typeof fv.hoveredOutlierIndex === 'number') outlierIndex = fv.hoveredOutlierIndex;
    if (typeof fv.hoveredItemIndex === 'number') itemIndex = fv.hoveredItemIndex;
    if (typeof fv.hoveredOutlierRadius === 'number' && fv.hoveredOutlierRadius >= 0) {
      outlierIndex = fv.hoveredOutlierRadius;
    }
  }

  if (outlierIndex >= 0 && stats.outliers && stats.outliers[outlierIndex] !== undefined) {
    return { kind: 'Outlier', value: stats.outliers[outlierIndex] };
  }
  if (itemIndex >= 0 && stats.items && stats.items[itemIndex] !== undefined) {
    return { kind: 'Point', value: stats.items[itemIndex] };
  }
  return null;
}

function boxplotExternalTooltip(context) {
  showExternalChartTooltip(context, function(item, tooltip) {
    var city = (item.dataset && item.dataset.label) || 'City';
    var yLabel = axisFieldLabel(chartOptions.yAxis);
    var point = boxplotHoveredPoint(tooltip, item);

    if (point && point.value !== undefined && point.value !== null) {
      return '<div class="chartjs-tooltip-title">' + city + '</div>' +
        tooltipTableHtml([
          { label: point.kind, value: formatChartNumber(point.value) },
          { label: 'Measure', value: yLabel }
        ]);
    }

    var stats = item.dataset && item.dataset.summary;
    if (!stats) return '';
    return '<div class="chartjs-tooltip-title">' + city + '</div>' +
      tooltipTableHtml([
        { label: 'Max', value: formatChartNumber(stats.max) },
        { label: 'Q3', value: formatChartNumber(stats.q3) },
        { label: 'Median', value: formatChartNumber(stats.median), cls: 'is-median' },
        { label: 'Q1', value: formatChartNumber(stats.q1) },
        { label: 'Min', value: formatChartNumber(stats.min) }
      ]);
  });
}

function scatterExternalTooltip(context) {
  var xLabel = axisFieldLabel(chartOptions.xAxis);
  var yLabel = axisFieldLabel(chartOptions.yAxis);
  showExternalChartTooltip(context, function(item) {
    var pt = item.raw || {};
    var title = (pt.card !== undefined ? 'Card #' + pt.card : 'Point') +
      (pt.city ? ' · ' + pt.city : '');
    return '<div class="chartjs-tooltip-title">' + title + '</div>' +
      tooltipTableHtml([
        { label: xLabel, value: formatChartNumber(pt.x) },
        { label: yLabel, value: formatChartNumber(pt.y) }
      ]);
  });
}

function histogramExternalTooltip(context) {
  var xLabel = axisFieldLabel(chartOptions.xAxis);
  showExternalChartTooltip(context, function(item) {
    var chartRef = item.chart || context.chart;
    var labels = (chartRef && chartRef.data && chartRef.data.labels) || [];
    var bin = labels[item.dataIndex] || '';
    var count = item.parsed && item.parsed.y !== undefined ? item.parsed.y : item.raw;
    var total = item.dataset && item.dataset.cityTotal;
    var city = (item.dataset && item.dataset.label) || 'City';
    var rows = [
      { label: xLabel, value: bin },
      { label: 'Cards', value: String(count) }
    ];
    if (total) {
      rows.push({
        label: 'Share',
        value: Math.round((Number(count) / total) * 100) + '%'
      });
    }
    return '<div class="chartjs-tooltip-title">' + city + '</div>' +
      tooltipTableHtml(rows);
  });
}

function refreshAxisSelectOptions() {
  populateOptions('xAxis', axisOptionsFor('xAxis'));
  populateOptions('yAxis', axisOptionsFor('yAxis'));
  populateOptions('pointColor', selectOptions);
}

// Function to add listeners for binCount and chartType
function addListeners() {
  const binCountInput = document.getElementById('binCount');
  if (binCountInput && !binCountInput.getAttribute('data-bound')) {
    binCountInput.value = String(chartOptions.binCount || 5);
    binCountInput.addEventListener('change', function () {
        chartOptions.binCount = parseInt(this.value, 10) || 5;
        renderChart();
    });
    binCountInput.setAttribute('data-bound', 'yes');
  }

  document.querySelectorAll('.chart-button').forEach(function(button) {
      if (button.getAttribute('data-bound')) return;
      button.addEventListener('click', function (event) {
          if (event && event.preventDefault) event.preventDefault();
          const chartType = this.getAttribute('data-chart-type');
          chartOptions.chartType = chartType;
          renderChart();
      });
      button.setAttribute('data-bound', 'yes');
  });
}

function firstFeatureColumns(count) {
  var cols = [];
  for (var i = 0; i < selectOptions.length && cols.length < count; i++) {
    if (selectOptions[i].value !== 'city') {
      cols.push(selectOptions[i].value);
    }
  }
  return cols;
}

function applyChartTypeLocks() {
  chartOptions.pointColor = 'city';
  if (chartOptions.chartType === 'boxplot') {
    chartOptions.xAxis = 'city';
  }

  // If city is colour (or scatter Y), push invalid axis picks onto first numeric feature
  var type = chartOptions.chartType;
  var features = firstFeatureColumns(2);
  if (type === 'scatter' || type === 'histogram') {
    if (chartOptions.xAxis === 'city') {
      chartOptions.xAxis = features[0] || chartOptions.xAxis;
    }
  }
  if (type === 'scatter' || type === 'boxplot') {
    if (chartOptions.yAxis === 'city') {
      chartOptions.yAxis = features[0] || chartOptions.yAxis;
    }
  }

  // Scatter defaults should not use the same feature on both axes
  if (type === 'scatter' && chartOptions.xAxis === chartOptions.yAxis) {
    if (features[1]) {
      chartOptions.yAxis = features[1];
    } else if (features[0] && chartOptions.xAxis !== features[0]) {
      chartOptions.xAxis = features[0];
    }
  }

  var pointSelect = document.getElementById('pointColor');
  if (pointSelect) {
    pointSelect.value = 'city';
  }
  var xSelect = document.getElementById('xAxis');
  if (xSelect && chartOptions.chartType === 'boxplot') {
    xSelect.value = 'city';
  }
}

function updateAxisControlMode() {
  var type = chartOptions.chartType;
  var xSelect = document.getElementById('xAxis');
  var ySelect = document.getElementById('yAxis');
  var xFixed = document.getElementById('chart-axis-x-fixed');
  var yFixed = document.getElementById('chart-axis-y-fixed');
  var binSel = document.getElementById('binCountSelector');
  var binCountInput = document.getElementById('binCount');

  if (binSel) {
    binSel.classList.toggle('hidden', type !== 'histogram');
  }
  if (binCountInput && type === 'histogram') {
    binCountInput.value = String(chartOptions.binCount || 5);
  }

  // Boxplot: X locked to City — plain label only
  if (xSelect && xFixed) {
    if (type === 'boxplot') {
      xSelect.classList.add('hidden');
      xFixed.classList.remove('hidden');
      xFixed.textContent = 'City';
    } else {
      xFixed.classList.add('hidden');
      xSelect.classList.remove('hidden');
      xSelect.value = chartOptions.xAxis;
    }
  }

  // Histogram: Y is Frequency — plain label; otherwise bordered select
  if (ySelect && yFixed) {
    if (type === 'histogram') {
      ySelect.classList.add('hidden');
      yFixed.classList.remove('hidden');
      yFixed.textContent = 'Frequency';
    } else {
      yFixed.classList.add('hidden');
      ySelect.classList.remove('hidden');
      ySelect.value = chartOptions.yAxis;
    }
  }
}

function positionAxisControls(chart) {
  if (!chart || !chart.chartArea) return;
  var stage = document.querySelector('#charts .chart-stage');
  var xWrap = document.getElementById('chart-axis-x-wrap');
  var yWrap = document.getElementById('chart-axis-y-wrap');
  if (!stage || !xWrap || !yWrap) return;

  var area = chart.chartArea;
  var xScale = chart.scales.x;
  var yScale = chart.scales.y;
  var midX = (area.left + area.right) / 2;
  var midY = (area.top + area.bottom) / 2;

  // Sit below tick labels (scale.bottom), not on top of them
  var xTop = xScale ? (xScale.bottom + 6) : (area.bottom + 28);
  xWrap.style.left = midX + 'px';
  xWrap.style.top = Math.min(xTop, stage.clientHeight - 4) + 'px';
  xWrap.style.transform = 'translate(-50%, 0)';

  // Sit in the left padding, clear of Y tick numbers
  var yLeft = yScale ? Math.max(10, yScale.left * 0.45) : 18;
  yWrap.style.left = yLeft + 'px';
  yWrap.style.top = midY + 'px';
  yWrap.style.transform = 'translate(-50%, -50%) rotate(-90deg)';
}

function decorateChartAxisTitles(chartConfig) {
  if (!chartConfig || !chartConfig.options) return;
  var scales = chartConfig.options.scales || {};
  var embed = document.documentElement.classList.contains('browse-embed');

  // Axis labels are HTML selects / fixed text overlays — hide canvas titles
  if (scales.x && scales.x.title) {
    scales.x.title.display = false;
  }
  if (scales.y && scales.y.title) {
    scales.y.title.display = false;
  }

  // Extra room so overlays clear tick numbers
  chartConfig.options.layout = chartConfig.options.layout || {};
  chartConfig.options.layout.padding = {
    top: 12,
    right: 16,
    bottom: chartOptions.chartType === 'histogram' ? 120 : 92,
    left: 108
  };

  if (embed && scales.x && scales.x.ticks) {
    scales.x.ticks.color = '#222222';
  }
  if (embed && scales.y && scales.y.ticks) {
    scales.y.ticks.color = '#222222';
  }
}


function renderChart() {
    applyChartTypeLocks();
    refreshAxisSelectOptions();
    updateAxisControlMode();

    const { chartType, xAxis, yAxis, pointColor, binCount } = chartOptions;
    let chartConfig;

    document.querySelectorAll('.chart-button').forEach(function(button) {
      var active = button.getAttribute('data-chart-type') === chartType;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (chartType === 'line') {
      chartConfig = createLineChart(chartData, xAxis, yAxis);
    } else if (chartType === 'scatter') {
      chartConfig = createScatterPlot(chartData, xAxis, yAxis, 'city');
    } else if (chartType === 'boxplot') {
      chartConfig = createBoxPlot(chartData, 'city', yAxis);
    } else if (chartType === 'histogram') {
      chartConfig = createHistogram(chartData, xAxis, binCount, 'city');
    }

    const canvasId = `myChart`;
    const canvasElement = $(`#${canvasId}`)[0];
    if (!chartConfig || !canvasElement) {
      return;
    }
    const context = canvasElement.getContext('2d');

    if (!chartConfig.options) {
      chartConfig.options = {};
    }
    chartConfig.options.responsive = true;
    chartConfig.options.maintainAspectRatio = false;
    decorateChartAxisTitles(chartConfig);

    if (chartInstance) {
      chartInstance.destroy();
    }
    chartInstance = new Chart(context, chartConfig);
    requestAnimationFrame(function() {
      positionAxisControls(chartInstance);
    });
  }

  function resizeEmbedChart() {
    if (!chartInstance) return;
    requestAnimationFrame(function() {
      try {
        chartInstance.resize();
        positionAxisControls(chartInstance);
      } catch (err) {}
    });
  }
  window.resizeEmbedChart = resizeEmbedChart;

  function createScatterPlot(data, xAxis, yAxis, colorField) {
    colorCounter = 0;
    var xLabel = axisFieldLabel(xAxis);
    var yLabel = axisFieldLabel(yAxis);
    var chrome = readableChartChrome();

    let colorValues = data.map(function(item) {
      return item[colorField];
    });

    colorValues = removeUndefinedValues(colorValues);
    const uniqueColorValues = [...new Set(colorValues)];
    let scatterData = {};

    if (colorField === 'none') {
      scatterData = {
        datasets: [{
          label: xLabel + ' vs ' + yLabel,
          data: data.map(function(item) {
            return {
              x: item[xAxis],
              y: item[yAxis],
              city: item.city,
              card: item.index
            };
          })
        }]
      };
    } else {
      scatterData = {
        datasets: uniqueColorValues.map(function(value) {
          const filteredData = data.filter(function(item) {
            return item[colorField] === value;
          });

          return {
            data: filteredData.map(function(item) {
              return {
                x: item[xAxis],
                y: item[yAxis],
                city: item.city,
                card: item.index
              };
            }),
            backgroundColor: getColor(value),
            label: value.toString(),
            pointRadius: 8,
            pointHoverRadius: 11
          };
        })
      };
    }

    const scatterOptions = {
      scales: {
        x: {
          title: {
            display: true,
            text: xLabel,
            color: modeColor,
            font: {
              size: 16,
            }
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        },
        y: {
          title: {
            display: true,
            text: yLabel,
            color: modeColor,
            font: {
              size: 16,
            }
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        }
      },
      plugins: {
        legend: chrome.legend,
        tooltip: {
          enabled: false,
          external: scatterExternalTooltip
        }
      }
    };

    const chartConfig = {
      type: 'scatter',
      data: scatterData,
      options: scatterOptions
    };

    return chartConfig;
  }

  function removeUndefinedValues(array) {
    return array.filter(value => typeof value !== 'undefined');
  }

  function createBoxPlot(data, xAxis, yAxis) {
    colorCounter = 0;
    var yLabel = axisFieldLabel(yAxis);
    var chrome = readableChartChrome();
    const uniqueXAxisValues = removeUndefinedValues(Array.from(new Set(data.map(item => item[xAxis]))));

    const datasets = uniqueXAxisValues.map((xValue) => {
      const filteredData = data.filter(item => item[xAxis] === xValue);
      const values = filteredData.map(item => parseFloat(item[yAxis])).filter(function(n) {
        return !Number.isNaN(n);
      });

      let color = getColor(xValue);
      return {
        label: String(xValue),
        data: [values],
        backgroundColor: color,
        borderColor: color,
        meanBackgroundColor: modeColor,
        outlierBackgroundColor: modeColor,
        meanColor: modeColor,
        color: modeColor,
        pointRadius: 8,
        summary: fiveNumberSummary(values)
      };
    });

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: {
            display: true,
            text: yLabel,
            color: modeColor,
            font: {
              size: 16
            }
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        },
        x: {
          title: {
            display: true,
            text: axisFieldLabel(xAxis),
            color: modeColor,
            font: {
              size: 16
            }
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        }
      },
      plugins: {
        legend: chrome.legend,
        tooltip: {
          enabled: false,
          external: boxplotExternalTooltip
        }
      }
    };

    const chartConfig = {
      type: 'boxplot',
      data: {
        labels: [''],
        datasets
      },
      options: options
    };

    return chartConfig;
  }

  function createHistogram(data, xAxis, binCount, splitField) {
    colorCounter = 0;
    var xLabel = axisFieldLabel(xAxis);
    var chrome = readableChartChrome();
    let xValues = data.map(function(item) {
      return item[xAxis];
    });

    const splitValues = data.map(function(item) {
      return item[splitField];
    });

    let uniqueSplitValues = [...new Set(splitValues)];

    uniqueSplitValues = removeUndefinedValues(uniqueSplitValues);
    xValues = removeUndefinedValues(xValues);
    const min = Math.min(...xValues);
    const max = Math.max(...xValues);
    const binLabels = createHistogramLabels(binCount, min, max);

    const datasets = uniqueSplitValues.map(function(value) {
      const filteredData = data.filter(function(item) {
        return item[splitField] === value;
      });
      const cityTotal = filteredData.length;

      const histogramData = createHistogramData(filteredData.map(function(item) {
        return item[xAxis];
      }), binCount, min, max);

      return {
        label: value.toString(),
        data: histogramData,
        backgroundColor: getColor(value),
        borderColor: 'rgba(0, 0, 0, 0.5)',
        borderWidth: 1,
        cityTotal: cityTotal
      };
    });

    const histogramOptions = {
      responsive: true,
      scales: {
        x: {
          title: {
            display: true,
            text: xLabel,
            color: modeColor,
            font: {
              size: 16
            }
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        },
        y: {
          title: {
            display: true,
            text: 'Frequency',
            color: modeColor,
            font: {
              size: 16
            }
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        }
      },
      plugins: {
        legend: chrome.legend,
        tooltip: {
          enabled: false,
          external: histogramExternalTooltip
        }
      }
    };

    const chartConfig = {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets
      },
      options: histogramOptions
    };

    return chartConfig;

  }

  // Helper function to create histogram data
  function createHistogramData(data, binCount, min, max) {
    const binSize = (max - min) / binCount;

    const histogramData = Array.from({ length: binCount }, function() {
      return 0;
    });

    data.forEach(function(value) {
      let binIndex = Math.floor((value - min) / binSize);
      if (binIndex === binCount) {
        binIndex = binIndex - 1;
      }
      if (binIndex >= 0 && binIndex < binCount) {
        histogramData[binIndex]++;
      }
    });

    return histogramData;
  }

  // Helper function to create histogram labels
  function createHistogramLabels(binCount, min, max) {
    const binSize = (max - min) / binCount;
    const labels = [];

    for (let i = 0; i < binCount; i++) {
      const label = `${(min + i * binSize).toFixed(2)} - ${(min + (i + 1) * binSize).toFixed(2)}`;
      labels.push(label);
    }

    return labels;
  }

  function createHistogramAllData(data, xAxis, binCount) {
    const values = data.map(function(item) {
      const value = item[xAxis];
      return isNaN(value) ? null : value;
    }).filter(function(value) {
      return value !== null;
    });

    // Calculate logical boundaries for the bins
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const binWidth = (maxValue - minValue) / binCount;
    const bins = [];
    for (let i = 0; i <= binCount; i++) {
      bins.push(minValue + i * binWidth);
    }
    const counts = Array(binCount).fill(0);
    for (let i = 0; i < values.length; i++) {
      const value = parseFloat(values[i]);
      for (let j = 0; j < binCount; j++) {
        if (value >= bins[j] && value <= bins[j + 1]) {
          counts[j]++;
          break;
        }
      }
    }

    const chartData = {
      labels: bins.slice(0, -1).map(function(bin, index) {
        return bin.toFixed(2) + '-' + bins[index + 1].toFixed(2);
      }),
      datasets: [{
        label: 'Frequency',
        data: counts
      }]
    };

    const options = {
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Bins',
            color: modeColor
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            color: modeColor,
            text: 'Frequency'
          },
          grid: {
            color: gridColor
          },
          ticks: {
            color: modeColor
          }
        }
      },
      plugins: {
        colorschemes: {
          scheme: 'brewer.Paired12'
        },
        legend: {
          display: false
        }
      }
    };
    const chartConfig = {
      type: 'bar',
      data: chartData,
      options: options
    };

    return chartConfig;
  }

  function getColor(label) {
    const ODI_DARK_BLUE = '#072589';
    const CITY_PURPLE = '#993399';
    const SERIES_COLORS = [ODI_DARK_BLUE, CITY_PURPLE, '#1f78ff', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'];
    if (label !== undefined && label !== null && label !== '') {
      const name = String(label).toLowerCase();
      if (name.indexOf('new york') !== -1 || name === 'ny') {
        return ODI_DARK_BLUE;
      }
      if (name.indexOf('san francisco') !== -1 || name === 'sf') {
        return CITY_PURPLE;
      }
    }
    const color = SERIES_COLORS[colorCounter % SERIES_COLORS.length];
    colorCounter += 1;
    return color;
  }