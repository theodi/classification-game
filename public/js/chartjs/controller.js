const chartOptions = {
  chartType: "boxplot",
  xAxis: "city",
  yAxis: "bath",
  pointColor: "city",
  binCount: 5,
};
let colorCounter = 0;
let chartData = {};
let chartInstance = null;
let mode = 'light';
let modeColor = 'black';

const selectOptions = ["Bath","Beds","Year Built","Elevation","Sqft","Price","Price per Sqft","City"];

$('document').ready(function(){
  populateOptions('xAxis', selectOptions);
  populateOptions('yAxis', selectOptions);
  populateOptions('pointColor', selectOptions);
  detectColorScheme();
});

function detectColorScheme() {
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

      var cardSets = document.querySelectorAll('.cardSet');

      // Loop through the cardbox elements and set their border color
      cardSets.forEach(function(cardSet) {
          cardSet.style.borderColor = gridColor;
      });

      document.getElementsByClassName('expandable-box')[0].style.borderColor = gridColor;

  } else {
      mode = 'light';
      modeColor = 'black';
      gridColor = 'rgba(0,0,0,0.1)';
  }
}

function populateOptions(elementName, selectOptions) {
  const selectElement = document.getElementById(elementName);
  selectElement.innerHTML = ''; // Clear existing options

  const selectedValue = chartOptions[elementName];

  selectOptions.forEach(option => {
      const optionElement = document.createElement('option');
      const optionValue = option.toLowerCase().replace(/ /g, '_'); // Convert value
      optionElement.value = optionValue;
      optionElement.text = option;

      // Set the default selected option based on the corresponding variable
      if (optionValue === selectedValue) {
          optionElement.selected = true;
      }

      selectElement.appendChild(optionElement);

      selectElement.addEventListener('change', function () {
        chartOptions[elementName] = this.value;
        renderChart();
      });
  });
}

// Function to add listeners for binCount and chartType
function addListeners() {
  const binCountInput = document.getElementById('binCount');
  binCountInput.addEventListener('change', function () {
      chartOptions.binCount = parseInt(this.value, 10);
      renderChart();
  });

  const chartButtons = document.querySelectorAll('.chart-button');
  chartButtons.forEach(button => {
      button.addEventListener('click', function () {
          const chartType = this.getAttribute('data-chart-type');
          chartOptions.chartType = chartType;
          renderChart();
      });
  });
}


function renderChart() {
    const { chartType, xAxis, yAxis, pointColor, binCount } = chartOptions;
    let chartConfig;

    if (chartType === 'histogram') {
      $('#binCountSelector').css('display', 'inline-block');
      $('#pointColorSelector').css('display', 'inline-block');
      $('#yAxisSelector').css('display', 'none');
    } else {
      $('#binCountSelector').css('display', 'none');
      $('#pointColorSelector').css('display', 'none');
      $('#yAxisSelector').css('display', 'inline-block');
    }
    if (chartType === 'scatter') {
      $('#pointColorSelector').css('display', 'inline-block');
    }
    if (chartType !== 'histogram' && chartType !== 'scatter') {
      $('#pointColorSelector').css('display', 'none');
    }

    if (chartType === 'line') {
      chartConfig = createLineChart(chartData, xAxis, yAxis);
    } else if (chartType === 'scatter') {
      chartConfig = createScatterPlot(chartData, xAxis, yAxis, pointColor);
    } else if (chartType === 'boxplot') {
      chartConfig = createBoxPlot(chartData, xAxis, yAxis, pointColor);
    } else if (chartType === 'histogram' && pointColor !== 'none') {
      chartConfig = createHistogram(chartData, xAxis, binCount, pointColor);
    } else if (chartType === 'histogram' && pointColor === 'none') {
      chartConfig = createHistogramAllData(chartData, xAxis, binCount);
    }

    const canvasId = `myChart`;
    const canvasElement = $(`#${canvasId}`)[0];
    const context = canvasElement.getContext('2d');

    if (chartInstance) {
      chartInstance.destroy();
    }
    chartInstance = new Chart(context, chartConfig);
  }

  function createScatterPlot(data, xAxis, yAxis, colorField) {
    colorCounter = 0;

    let colorValues = data.map(function(item) {
      return item[colorField];
    });

    colorValues = removeUndefinedValues(colorValues);
    const uniqueColorValues = [...new Set(colorValues)];
    let scatterData = {};

    if (colorField === 'none') {
      scatterData = {
        datasets: [{
          label: xAxis + ', ' + yAxis,
          data: data.map(function(item) {
            return {
              x: item[xAxis],
              y: item[yAxis]
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
                y: item[yAxis]
              };
            }),
            backgroundColor: getColor(),
            label: value.toString(),
            pointRadius: 8
          };
        })
      };
    }

    const scatterOptions = {
      scales: {
        x: {
          title: {
            display: true,
            text: xAxis,
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
            text: yAxis,
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
        legend: {
          display: true,
          color: modeColor
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
    // Get the unique values for the yAxis
    const uniqueXAxisValues = removeUndefinedValues(Array.from(new Set(data.map(item => item[xAxis]))));

    // Prepare the datasets for the box plot
    const datasets = uniqueXAxisValues.map((xValue, index) => {
      const filteredData = data.filter(item => item[xAxis] === xValue);
      const values = filteredData.map(item => parseFloat(item[yAxis]));

      let color = getColor();
      return {
        label: xValue,
        data: [values],
        backgroundColor: color,
        borderColor: color,
        meanBackgroundColor: modeColor,
        outlierBackgroundColor: modeColor,
        meanColor: modeColor,
        color: modeColor,
        pointRadius: 8
      };
    });

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: {
            display: true,
            text: yAxis,
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
            text: xAxis,
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
      }
    };

    // Create the box plot chart
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

    const datasets = uniqueSplitValues.map(function(value) {
      const filteredData = data.filter(function(item) {
        return item[splitField] === value;
      });

      const histogramData = createHistogramData(filteredData.map(function(item) {
        return item[xAxis];
      }), binCount, min, max);

      return {
        label: value.toString(),
        data: histogramData,
        backgroundColor: getColor(),
        borderColor: 'rgba(0, 0, 0, 0.5)',
        borderWidth: 1
      };
    });

    const histogramOptions = {
      responsive: true,
      scales: {
        x: {
          title: {
            display: true,
            text: xAxis,
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
        legend: {
          display: true,
          color: modeColor
        }
      }
    };

    const chartConfig = {
      type: 'bar',
      data: {
        labels: createHistogramLabels(binCount, min, max),
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

  function getColor() {
    const Paired12 = ['#993399', '#1f78ff', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'];
    const color = Paired12[colorCounter];
    colorCounter += 1;
    return color;
  }