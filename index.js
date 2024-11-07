import * as d3 from 'd3';
import { Map, Popup } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
var accessToken = import.meta.env.VITE_ACCESS_TOKEN
var style = import.meta.env.VITE_MAPBOX_STYLE

var map, map_taxagroup, map_year_taxagroup, map_year_taxaname, samples_taxagroup, samples_taxaname, brushX
var clicked = false
var clickedLine = false
var clickedMarker = false
var searched = false
var selectedValues = []

var year_range = [1989, 2023]
var years = d3.range(year_range[0], year_range[1]+1)
var newRange = [new Date(year_range[0], 0, 1), new Date(year_range[1], 0, 1)]

var parseYear = d3.timeParse("%Y") // creates a function that parses a string representing a year into a JavaScript Date object

var tags = ["water", "biota", "sediments", "fish", "invertebrates", "macroalgae", 'phytoplankton']
var color = d3.scaleOrdinal()
  .domain(tags)
  .range(["blue", "#ffff00", "#ffe6a7", "#FF00A1","#90FE00", "#c200fb", "#00FFF7"])

var colorAge = d3.scaleSequential()
  .domain([0, 50])
  .interpolator(d3.interpolateRdPu)

var axisColor = "#d4d4d4"
var margin = { top: 20, right: 20, bottom: 30, left: 30 }

function init() {
  const files = [
    '/data/map_year_taxagroup.csv',
    '/data/map_year_taxaname.csv',
    '/data/taxagroup.csv',
    '/data/taxaname.csv',
    '/data/map_taxagroup.csv',
  ];

  Promise.all(files.map(file => d3.csv(file)))
    .then(data => {
      initMap(data[4])
      return data.slice(0,4)
    })
    .then(data => {
      processData(data)
    })
    .catch(error => {
      console.error("Error loading JSON files:", error);
    });
}

function processData(raw) {
  map_year_taxagroup = raw[0]
  map_year_taxaname= raw[1]
  samples_taxagroup = raw[2]
  samples_taxaname = raw[3]

  createLegend(tags)

  menu(map_year_taxagroup, tags) // set up dropdown menu

  samples_taxagroup.forEach((d, i) => {
    d.year = parseYear(parseInt(d['year']).toString())
    d.cumulative_value = +d.cumulative_value
    d.value = +d.value
  })
  map_year_taxagroup.forEach((d, i) => {
    d.year = parseYear(parseInt(d['year']).toString())
    d.value = +d.value
  })
  multipleLineChartBrush(samples_taxagroup, map_year_taxagroup, { id:'#chart-main', groupBy: 'taxagroup', value: 'cumulative_value', brush: true, title: 'Cumulated number of samples collected' })

  samples_taxaname.forEach((d, i) => {
    d.year = parseYear(parseInt(d['year']).toString())
    d.value = +d.value
  })
  map_year_taxaname.forEach((d, i) => {
    d.year = parseYear(parseInt(d['year']).toString())
    d.cumulative_value = +d.cumulative_value
    d.value = +d.value
  })
  multipleLineChartStack(samples_taxaname, map_year_taxagroup, map_year_taxaname, { id:'#chart-sub', groupBy: 'taxagroup', groupBy2: 'taxaname', value: 'value', stacked: true, title: 'Top 10 Species: Number of samples collected' })

  const lastData =  samples_taxagroup.filter(d => d.year.getTime() === newRange[1].getTime())
  const total = lastData.reduce(function (a, b) { return a + b.cumulative_value; }, 0);
  searchPanel(total, year_range)

  d3.select(".reset")
    .on('click', function () {
      console.log('click')
      d3.selectAll('.brush').call(brushX.move, null);
      newRange = [new Date(year_range[0], 0, 1), new Date(year_range[1], 0, 1)]

      // Reset all lines to their original styles
      d3.select('#chart-sub').selectAll('.line')
        .style('stroke', d => d[0].color)
        .style('opacity', d => d[0].opacity)
        .style('stroke-width', d => d[0].strokeWidth)

      // Clear the label
      d3.select('#chart-sub').selectAll('.label').text('');

      const sites_with_taxagroup = selectedValues.length > 0 ? map_year_taxagroup.filter(d => selectedValues.indexOf(d.taxagroup) !== -1) : map_year_taxagroup
      update(sites_with_taxagroup, newRange)

      multipleLineChartStack(samples_taxaname, map_year_taxagroup, map_year_taxaname, { id:'#chart-sub', groupBy: 'taxagroup', groupBy2: 'taxaname', value: 'value', stacked: true, title: 'Top 10 Species: Number of samples collected over time' })

      clickedLine = null
      clickedMarker = null
    })
}

///////////////////////////////////////////////////////////////////////////
/////////////////////////////////// Map  //////////////////////////////////
///////////////////////////////////////////////////////////////////////////
function initMap(data) {
  map = new Map({
    container: 'map',
    style,
    accessToken,
    center: [-2.4, 43.5097],
    zoom: 8.8,
    antialias: false,
    maxZoom: 20,
    minZoom: 6
  });

  var dotsGeoJSON = { "type": "FeatureCollection", "features": [] }
  data.map((d, i) => {
    dotsGeoJSON.features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [+d.decimallongitude, +d.decimallatitude]
      },
      properties: {
        ...d,
        total: +d.value,
        tag: color(d.taxagroup),
        age: colorAge(d.age)
      }
    })
  })
  console.log('map init', map)

  map.on('load', function () {
    console.log("map loaded", dotsGeoJSON.features.length)
    if (dotsGeoJSON.features.length > 0) {
      //if (map.getLayer('circle') == undefined) {
        map.addLayer({
          'id': 'circle',
          'type': 'circle',
          'source': {
            "type": "geojson",
            "data": dotsGeoJSON
          },
          'paint': {
            // make circles larger as the user zooms in
            'circle-radius': [
              'interpolate', 
              ['linear'], 
              ['zoom'], 
              9, [
                'interpolate', 
                ['linear'], 
                ['get', 'total'],
                0, 0,  
                10, 3.5,
                100, 5,
                500, 6,
                1000, 10
              ],
              18, [
                'interpolate', 
                ['linear'], 
                ['get', 'total'],
                0, 0,    // For total value 0, set radius to 3 at zoom level 18
                10, 5, 
                100, 9, 
                500, 12, 
                1000, 20 
              ]
            ],
            'circle-color': ['get', 'tag'],
            'circle-opacity': 0.8
          }
        })
      //}

      //if (map.getLayer('siteid-label') == undefined) {
        // Add the symbol layer to display the text
        map.addLayer({
            id: 'siteid-label',
            type: 'symbol',
            source: {
              "type": "geojson",
              "data": dotsGeoJSON
            },
            layout: {
                'text-field': ['get', 'siteid'], // Fetch text from feature properties
                'text-size': 9,               // Customize text size
                'text-anchor': 'top' ,          // Adjust the text position
                'text-offset': [0, -2],
            },
            paint: {
                'text-color': '#ffffff'        // Customize text color
            },
            minzoom: 8                       // Layer will only be visible at zoom level 8 or higher
        });
      //}

      //if (map.getLayer('siteid-count-label') == undefined) {
        // Add the symbol layer to display the text
        map.addLayer({
            id: 'siteid-count-label',
            type: 'symbol',
            source: {
              "type": "geojson",
              "data": dotsGeoJSON
            },
            layout: {
                'text-field': ['get', 'total'], // Fetch text from feature properties
                'text-size': 8,               // Customize text size
                'text-anchor': 'center',          // Adjust the text position
                'text-offset': [0, 0],
                'visibility': 'visible' 
            },
            paint: {
                'text-color': '#000'        // Customize text color
            },
            minzoom: 12
        });
      //}
      console.log(map.getLayer('circle').id)
    }
  })

  tooltip(map)
}

function updateMap(data) {
  const dotsGeoJSON = { "type": "FeatureCollection", "features": [] }
  data.map((d, i) => {
    dotsGeoJSON.features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [+d.decimallongitude, +d.decimallatitude]
      },
      properties: {
        ...d,
        tag: color(d.taxagroup),
        age: colorAge(d.age)
      }
    })
  })

  map.getSource('circle').setData(dotsGeoJSON)
  map.getSource('siteid-label').setData(dotsGeoJSON)
  map.getSource('siteid-count-label').setData(dotsGeoJSON)
}

function tooltip(map) {
  // Create a popup, but don't add it to the map yet.
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    anchor: 'top'
  });

  map.on('mouseenter', 'circle', function (e) {
    // Change the cursor style as a UI indicator.
    map.getCanvas().style.cursor = 'pointer';
    let coordinates = e.features[0].geometry.coordinates.slice();
    let properties = e.features[0].properties
    let description = `
    <div>
      <p style="font-weight: bold; font-size: 13px; color: black">${properties.sitename}</p>
      <h4>Site ID: ${properties.siteid}</h4>
      <h4>Taxanomy group: ${properties.taxagroup}</h4>
      <h4>Total samples collected: ${properties.total}</h4>
    </div>
  `;

    // Ensure that if the map is zoomed out such that multiple
    // copies of the feature are visible, the popup appears
    // over the copy being pointed to.
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    // Populate the popup and set its coordinates
    // based on the feature found.
    popup
      .setLngLat(coordinates)
      .setHTML(description)
      .addTo(map);
  });

  map.on('mouseleave', 'circle', function () {
    //if(clickedMarker) return
    map.getCanvas().style.cursor = '';
    popup.remove();
  });

  map.on('click', 'circle', function (e) {
    const siteid = e.features[0].properties.siteid
    const selectedSiteData = map_year_taxaname.filter(d => d.siteid === siteid).sort((a, b) => a.year - b.year)
    multipleLineChartStack(selectedSiteData, null, null, { id:'#chart-sub', groupBy: 'taxagroup', groupBy2: 'taxaname', value: 'cumulative_value', stacked: true, title: `${siteid}: Number of cumulated samples collected` })
    
    clickedMarker = siteid
  })
}

///////////////////////////////////////////////////////////////////////////
//////////////////////////// Multiple line chart //////////////////////////
//////////////////////////////////////////art/////////////////////////////////
function multipleLineChartBrush(data, map_data, options = { id:'#chart', groupBy: 'tag', value: 'value', brush: false, title: '' }) {  
  const {id, groupBy, brush, title, value} = options

  const res_nested = Array.from(d3.group(data, d => d[groupBy]))
    .map(([key, values]) => ({
      key,
      values: values.sort((a, b) => a.year - b.year) // Sort values based on parsed years
    }));

  const chart = d3.select(id)
  chart.selectAll("*").remove();

  const rect = chart.node().getBoundingClientRect();
  const svg = chart.append("svg")
    .attr("width", rect.width)
    .attr("height", rect.height)

  const group = svg.append('g')

  const xScale = d3.scaleTime()
  .domain(d3.extent(years, function (d) { return parseYear(d) }))
  .range([margin.left, rect.width - margin.right])

  const yScale = d3.scaleSqrt()
    .domain([0, d3.max(res_nested.map(d => d.values).flat(), d => d[value])])
    .range([rect.height - margin.bottom, margin.top]);

  // Add x-axis
  group.append("g")
    .attr("transform", `translate(0,${rect.height - margin.bottom})`)
    .call(d3.axisBottom(xScale).tickSize(0).ticks(6))
    .call(g => {
      g.selectAll("text")
        .attr('fill', axisColor)
        .style('font-size', '11px');
      g.selectAll("line")
        .attr('stroke', axisColor);
      g.select(".domain").remove();
    });

  // Add Y-axis
  group.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).tickSize(-rect.width + margin.right).ticks(3).tickFormat(d3.format("~s")))
    .call(g => {
      g.selectAll("line")
        .attr('stroke', '#525252')
        .attr('stroke-width', 0.7) // make horizontal tick thinner and lighter so that line paths can stand out
        .attr('opacity', 0.3)

      g.selectAll("text")
        .attr('fill', axisColor)
        .style('font-size', '10px');
      g.select(".domain").remove();
    });

  const line = d3.line()
    .x(function (d) { return xScale(d.year) })
    .y(function (d) { return yScale(d[value]) })

  const glines = group.selectAll('.line-group').data(res_nested, d => d.key)

  const entered_lines = glines.enter().append('g').attr('class', 'line-group')

  entered_lines.append('path').attr('class', 'line')

  glines.merge(entered_lines).select('.line')
    .attr('d', function (d) { return line(d.values) })
    .style('stroke', (d, i) => color(d.key))
    .style('fill', 'none')
    .style('opacity', 0.8)
    .style('stroke-width', '1.5px')
    .style('stroke-cap', 'round')

  glines.exit().remove()

  // Create a chart title
  group.append('text')
    .attr('class', 'title')
    .attr("transform", `translate(${(rect.width - margin.right) / 2},${margin.top})`)
    .style('text-anchor', 'middle')
    .style('font-size', '13px')
    .attr('fill', axisColor)
    .text(title);

  if(!brush) return
  // BRUSH
  brushX = d3.brushX().extent([[margin.left, margin.top], [rect.width - margin.right, rect.height - margin.bottom]])

  group.append("g")
    .attr("class", "brush")
    .call(brushX)

  brushX.on("brush end", brushed)

  function brushed(event) {
    if(event.type !== "end") return
    if (event.sourceEvent && event.sourceEvent.type === "zoom" || clickedLine || clickedMarker) return; // ignore brush-by-zoom
    
    // Get the selection from the event object
    var s = event.selection || xScale.range();

    // Map the selected range to the xScale domain (i.e., convert pixel values to data values)
    newRange = s.map(xScale.invert, xScale);

    // Snap the selection boundaries to the nearest year
    newRange = newRange.map(d3.timeYear.round);

    if (searched == true) {
      // Filter data based on the selected taxagroup
      const selectedData = map_data.filter(d => selectedValues.indexOf(d.taxagroup) !== -1)
      update(selectedData, newRange);
    } else {
      // Update elements with the full dataset and new range
      update(map_data, newRange);
    }
  }
}

function multipleLineChartStack(data, map_data, map_data1, options = { id: '#chart', groupBy: 'tag', groupBy2: 'taxaname', value: 'value', stacked: true, title: '' }) {
  const { id, groupBy, groupBy2, value, stacked, title } = options;

  const res_nested = Array.from(d3.group(data, d => d[groupBy]))
  .map(([key, values]) => ({
    key,
    values: values.sort((a, b) => a.year - b.year) // Sort values based on parsed years
  }));

  const chart = d3.select(id)
  chart.selectAll("*").remove();

  const rect = chart.node().getBoundingClientRect();
  const svg = chart.append("svg")
    .attr("width", rect.width)
    .attr("height", rect.height)

  const group = svg.append('g')

  // const colorScale = d3.scaleOrdinal()
  //   .domain(Array.from(new Set(data.map(d => d[groupBy2]))))
  //   .range(['#c026d3', '#e879f9', '#f5d0fe', '#fdf4ff']);

  const xScale = d3.scaleTime()
    .domain(d3.extent(data, d => d.year))
    .range([margin.left, rect.width - margin.right]);

  // Add x-axis
  group.append("g")
    .attr("transform", `translate(0,${rect.height - margin.bottom})`)
    .call(d3.axisBottom(xScale).tickSize(0).ticks(6))
    .call(g => {
      g.selectAll("text")
        .attr('fill', axisColor)
        .style('font-size', '11px');
      g.selectAll("line")
        .attr('stroke', axisColor);
      g.select(".domain").remove();
    });

  // Create a chart title
  group.append('text')
    .attr('class', 'title')
    .attr("transform", `translate(${(rect.width - margin.right) / 2},${margin.top})`)
    .style('text-anchor', 'middle')
    .style('font-size', '13px')
    .attr('fill', axisColor)
    .text(title);

  // Create a text element for the label
  const label = group.append('text')
    .attr('class', 'label')
    .attr("transform", `translate(${rect.width - 80},${margin.top})`)
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('text-anchor', 'middle')
    .attr('fill', axisColor)
    .text('');

  // If stacked, calculate individual chart heights
  const chartHeight = stacked ? (rect.height - margin.bottom) / res_nested.length : rect.height - margin.bottom;

  const yScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d[value]))
    .range([chartHeight - margin.bottom, margin.top]);

  if (!stacked) {
    // Add Y-axis
    group.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      //.call(d3.axisLeft(yScale).tickSize(0).ticks(3).tickFormat(d3.format("~s")))
      .call(d3.axisLeft(yScale).tickSize(-rect.width + margin.right).ticks(6).tickFormat(d3.format("~s")))
      .call(g => {
        g.selectAll("line")
          .attr('stroke', '#525252')
          .attr('stroke-width', 0.7) // make horizontal tick thinner and lighter so that line paths can stand out
          .attr('opacity', 0.3)

        g.selectAll("text")
          .attr('fill', axisColor)
          .style('font-size', '10px');
        g.select(".domain").remove();
      });
  }

  res_nested.forEach((type, i) => {
    const container = stacked
      ? group.append('g')
        .attr('class', `chart-group-${type.key.replace(/\s+/g, '-')}`)
        .attr('transform', `translate(0, ${i * chartHeight})`) // Stack each chart
      : group;

    const line = d3.line()
      .curve(d3.curveMonotoneX)
      .x(d => xScale(d.year))
      .y(d => yScale(d[value]));

    if (stacked) {
      // Nested chart with multiple lines for each street
      const res_nested2 = Array.from(d3.group(type.values, d => d[stacked ? groupBy2 : groupBy]))
      .map(([key, values]) => {
        const totalValue = d3.sum(
          values,
          d => d[value]
        );
        return {
          key,
          values: values.sort((a, b) => a.year - b.year),
          totalValue,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue); // Sort by total value
      
      const top10 = res_nested2.slice(0, 10);
      const highlighted = new Set([...top10].map(d => d.key));
      
      const yScale = d3.scaleLinear().range([chartHeight, margin.top / 2])
      const extent = d3.extent(type.values, d => d[value]);
      const buffer = (extent[1] - extent[0]) * 0.05; // 5% buffer
      yScale.domain([extent[0] - buffer, extent[1] + buffer]); // Adjust domain with buffer
      line.y(d => yScale(d[value]));
      
      res_nested2.forEach((data) => {
        data.values.forEach(d => {
          d.color = highlighted.has(data.key) ? color(d[groupBy]) : axisColor
          d.opacity = highlighted.has(data.key) ? 0.8 : 0.3
          d.strokeWidth = highlighted.has(data.key) ? '0.6px' : '0.2px'
        })
        
        container.append('path')
          .datum(data.values)
          .attr('class', `line line-${data.key.replace(/\s+/g, '-')}`)
          .attr('d', line)
          .style('stroke', d => d[0].color)
          .style('opacity', d => d[0].opacity)
          .style('stroke-width', d => d[0].strokeWidth)
          .style('fill', 'none');
      });

      // Add Y-axis for each stacked chart
      container.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).tickSize(0).ticks(3).tickFormat(d3.format("~s")))
        .call(g => {
          g.selectAll("text")
            .attr('fill', axisColor)
            .style('font-size', '9px');
          g.select(".domain").remove();
        });

      // Add chart label
      container.append("text")
        .attr("transform", `translate(${margin.left + 10}, ${margin.top})`)
        .style("text-anchor", "left")
        .style("fill", axisColor)
        .style("font-size", "13px")
        .text(type.key);

      // Add chart separator line
      container.append("line")
        .attr("transform", `translate(0,${chartHeight})`)
        .attr('x1', 0)
        .attr('x2', rect.width)
        .attr('y1', 0)
        .attr('y2', 0)
        .style('stroke', '#525252')

    } else {
      type.values.forEach(d => {
        d.color = highlighted.has(type.key) ? color(d[groupBy]) : axisColor
        d.opacity = highlighted.has(type.key) ? 0.8 : 0.3
        d.strokeWidth = highlighted.has(type.key) ? '0.6px' : '0.2px'
      })

      // Single line for each group in the regular chart
      container.append('path')
        .datum(type.values)
        .attr('class', `line line-${type.key.replace(/\s+/g, '-')}`)
        .attr('d', line)
        .style('stroke', d => d[0].color)
        .style('opacity', d => d[0].opacity)
        .style('stroke-width', d => d[0].strokeWidth)
        .style('fill', 'none');
    }
  });

  // INTERACTION
  const lines = group.selectAll(`.line`)
  const key = stacked ? groupBy2 : groupBy

  function highlightLines(d) {
    const hoveredName = d[0][key];  // Extract the name from hovered line
    // Highlight all lines with the same name within the same container
    lines
      .style('opacity', 0.2)  // First, set all lines to lower opacity
      .filter(function (l) {
        // Keep only the lines with the same name
        return l[0][key] === hoveredName;
      })
      .style('opacity', 1)  // Set opacity for matching lines
      .style('stroke-width', '3px');  // Increase stroke width for matching lines

    // Update the label with the name
    label.text(hoveredName);
  }

  function unhighlightLines() {
    // Reset all lines to their original styles
    lines
      .style('stroke', d => d[0].color)
      .style('opacity', d => d[0].opacity)
      .style('stroke-width', d => d[0].strokeWidth)

    // Clear the label
    label.text('');
  }

  lines
    .on('mouseover', function (event, d) {
      if (!clickedLine) highlightLines(d)
    })
    .on('mouseout', function () {
      if (!clickedLine) unhighlightLines()
    })
    .on('click', function (event, d) {
      if(!map_data && !map_data1) return

      highlightLines(d)
      const sites_with_taxaname = map_data1.filter(m => m['taxaname'] === d[0][key])
      const groupedBySite = d3.group(sites_with_taxaname, d => d.siteid);

      const lastRecords = Array.from(groupedBySite, ([siteid, records]) => {
        records.sort((a, b) => a.year - b.year);
        
        const lastRecord = records[records.length - 1]; // Take the last record (most recent year due to sorting)
        lastRecord.total = lastRecord.cumulative_value; // Set total to cumulative_value
        return lastRecord;
      });
      updateMap(lastRecords)

      clickedLine = d[0][key]
    })
}
///////////////////////////////////////////////////////////////////////////
///////////////////////////////// Miscellaneous ///////////////////////////
///////////////////////////////////////////////////////////////////////////
function update(data, range) {
  const groupedBySite = Array.from(d3.group(data, d => d.siteid))
  .map(([siteid, records]) => {
    // Further group by taxagroup within each site group
    const groupedByTaxa = Array.from(d3.group(records, d => d.taxagroup));

    // Process each taxagroup
    return groupedByTaxa.map(([taxagroup, values]) => {
      const years = values.map(d => d.year).sort((a, b) => a - b);
          
      // Calculate minYear as one year before range[0]
      const oneYearBeforeRangeStart = new Date(range[0]);
      oneYearBeforeRangeStart.setFullYear(Math.max(oneYearBeforeRangeStart.getFullYear(), 1989));

      // Find the earliest available collection date in the site that is at/later than range start date on timeline, but within brush end date
      const minYear = years.filter(year => year.getTime() >= oneYearBeforeRangeStart.getTime() && year.getTime() <= range[1].getTime())[0];

      // Find the last available collection date in the site that is at/earlier than brush end date on timeline, but within brush start date
      const maxYear = years.filter(year => year.getTime() <= range[1].getTime() && year.getTime() >= range[0].getTime()).pop(); 
      
      if (minYear && maxYear) {
        const data = values.filter (d => d.year.getTime() >= minYear.getTime() && d.year.getTime() <= maxYear.getTime());
        const total = data.reduce(function (a, b) { return a + b.value }, 0);  

        return {
          ...data[0],
          total
        };
      } else {
        //console.log('no data found', taxagroup, siteid)
        return null;
      }
    });
  })
  .flat() // Flatten the array after mapping taxagroups
  .filter(d => d !== null) // Remove null values
  .sort((a, b) => b.total - a.total);

  updateMap(groupedBySite)

  const total = groupedBySite.reduce(function (a, b) { return a + b.total }, 0);  
  searchPanel(total, range.map(d => d.getFullYear().toString()))
}

function menu(data, tags) {
  d3.select("#dropdown-btn").on("click", toggleDropdown)

  const dropdownMenu = d3.select("#dropdown-menu");

  const items = dropdownMenu.selectAll(".dropdown-item")
    .data(['total', ...tags])
    .enter()
    .append("label")
    .attr("class", "dropdown-item");

  items.append("input")
    .attr("type", "checkbox")
    .attr("value", d => d)
    .on("click", function (event, option) {
      handleCheckboxChange(option, d3.select(this).node());

      // Get all checkboxes
      const checkboxes = dropdownMenu.selectAll("input[type='checkbox']");

      if (option === 'total' && this.checked) {
        // If 'total' is checked, uncheck all other checkboxes
        checkboxes.each(function(d) {
          if (d !== 'total') { 
            this.checked = false; // Uncheck the checkbox
          }
        });
        selectedValues = []; // Update selectedValue
        searched = false
        update(data, newRange)

        d3.select('#chart-main').selectAll('.line').style('opacity', 0.8)  
      } else {
        searched = true
        const selectedData = data.filter(d => selectedValues.indexOf(d.taxagroup) !== -1)
        update(selectedData, newRange)

        d3.select('#chart-main').selectAll('.line')
          .style('opacity', 0.2)  // First, set all lines to lower opacity
          .filter(function (l) {
            // Keep only the lines with the same name
            return selectedValues.indexOf(l.key) !== -1;
          })
          .style('opacity', 1)  // Set opacity for matching lines
      }
    })

  // Append text to each dropdown item
  items.append("span").text(d => d);
}

function searchPanel(total, range) {
  d3.select('#total').html(total)
  d3.select('#years').html(range[0] + " and " + range[1])
}

function createLegend(category) {
  const svgLegend = d3.selectAll('.gLegend')

  svgLegend.selectAll('.legend-pill')
    .data(category)
    .enter().append('div')
    .attr("class", "legend-pill")
    .style("background-color", d => color(d))
    .style("color", "black")
    .text(d => d)

  d3.select(".color-toggle")
    .on('click', function () {
      if (!clicked) {
        d3.select(this).html('Color properties by taxagroup')
        map.setPaintProperty('circle', 'circle-color', ['get', 'age'])

        d3.select(".color-legend").selectAll('.legend-pill')
          .data([0, 15, 25, 35])
          .enter().append('div')
          .attr("class", "legend-pill")
          .style("background-color", d => colorAge(d))
          .style("color", (d, i) => i <= 2 ? "black" : "white")
          .text(d => d)

      } else {
        d3.select(this).html('Color properties by site age')
        map.setPaintProperty('circle', 'circle-color', ['get', 'tag'])
        d3.select(".color-legend").selectAll('.legend-pill').remove()
      }
      clicked = !clicked
    })
}

init()

///////////////////////////////////////////////////////////////////////////
///////////////////////////// Helper functions ////////////////////////////
///////////////////////////////////////////////////////////////////////////
// Function to toggle the dropdown menu
function toggleDropdown() {
  const dropdown = document.getElementById('dropdown');
  dropdown.classList.toggle('dropdown-open');
}

// Function to handle checkbox changes
function handleCheckboxChange(option, checkbox) {
  if(clickedLine || clickedMarker) return
  if (checkbox.checked) {
    selectedValues.push(option);
  } else {
    const index = selectedValues.indexOf(option);
    if (index > -1) {
      selectedValues.splice(index, 1);
    }
  }
  updateDropdownButton();
}

// Function to update the button text with selected options
function updateDropdownButton() {
  const button = document.getElementById('dropdown-btn');
  button.textContent = selectedValues.length > 0 ? selectedValues.join(', ') : 'Select options';
  dropdown.classList.toggle('dropdown-open');
}
