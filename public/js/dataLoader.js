// Function to fetch CSV data
function fetchCSVData(callback) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/houses.csv', true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            callback(xhr.responseText);
        }
    };
    xhr.send();
}

// Function to process and display CSV data
function filterCSVData(data, queryParamArray) {
    const lines = data.split('\n');
    const cards = [];

    lines.forEach((line, lineIndex) => {
        if (lineIndex === 0) {
            // Skip the header row
            return;
        }

        const columns = line.split(',');
        const index = Number(columns[0].trim()); // Trim to remove leading/trailing whitespace
        if (queryParamArray.includes(index)) {
            // Check if the index is included in the queryParamArray
            cards.push({
                index,
                bath: columns[1],
                beds: columns[2],
                year_built: columns[3],
                elevation: columns[4],
                sqft: columns[5],
                price: columns[6],
                price_per_sqft: columns[7],
                city: columns[8]
            });
        }
    });

    return cards;
}
