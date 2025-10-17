// Test Relief Image Generation

function showError(message) {
    console.error('Error:', message);
    document.getElementById('error').innerHTML = `<strong>Error:</strong> ${message}`;
}

function clearError() {
    document.getElementById('error').innerHTML = '';
}

async function getHexagon() {
    clearError();
    const lat = document.getElementById('lat').value;
    const lng = document.getElementById('lng').value;
    const zoom = document.getElementById('zoom').value;
    
    console.log('Getting hexagon for:', { lat, lng, zoom });
    
    try {
        const url = `/api/h3/from-coords?lat=${lat}&lng=${lng}&zoom=${zoom}`;
        console.log('Fetching:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('Response:', data);
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        
        document.getElementById('hexagonId').value = data.hexagonId;
        document.getElementById('info').innerHTML = `
            <div class="success">
                <strong>Hexagon:</strong> ${data.hexagonId}<br>
                <strong>Resolution:</strong> ${data.resolution}<br>
                <strong>Area:</strong> ${data.areaKm2.toFixed(2)} km²
            </div>
        `;
    } catch (error) {
        showError('Failed to get hexagon: ' + error.message);
    }
}

async function generateImages() {
    clearError();
    const hexagonId = document.getElementById('hexagonId').value;
    
    if (!hexagonId) {
        showError('Please enter a hexagon ID or get one from coordinates');
        return;
    }
    
    console.log('Generating images for hexagon:', hexagonId);
    
    const container = document.getElementById('images');
    container.innerHTML = '<p>Loading...</p>';
    
    try {
        // Get metadata first
        const metaUrl = `/api/h3/${hexagonId}/relief-image/metadata`;
        console.log('Fetching metadata:', metaUrl);
        
        const metaResponse = await fetch(metaUrl);
        const metadata = await metaResponse.json();
        
        console.log('Metadata response:', metadata);
        
        if (!metaResponse.ok) {
            throw new Error(metadata.error || 'Failed to get metadata');
        }
        
        // Generate different versions
        const images = [
            {
                title: 'Relief Image (512x512)',
                url: `/api/h3/${hexagonId}/relief-image?width=512&height=512`
            },
            {
                title: 'Relief Image (256x256)',
                url: `/api/h3/${hexagonId}/relief-image?width=256&height=256`
            },
            {
                title: 'With Contours (25m)',
                url: `/api/h3/${hexagonId}/relief-image/contour?interval=25`
            },
            {
                title: 'With Contours (50m)',
                url: `/api/h3/${hexagonId}/relief-image/contour?interval=50`
            }
        ];
        
        container.innerHTML = `
            <div class="image-box" style="grid-column: 1 / -1;">
                <h3>Metadata</h3>
                <p>
                    <strong>Center:</strong> ${metadata.center.lat.toFixed(4)}, ${metadata.center.lng.toFixed(4)}<br>
                    <strong>Elevation Range:</strong> ${metadata.elevationRange.min}m - ${metadata.elevationRange.max}m<br>
                    <strong>Area:</strong> ${metadata.areaKm2.toFixed(2)} km²
                </p>
            </div>
        `;
        
        images.forEach(img => {
            console.log('Adding image:', img.title, img.url);
            const imageBox = document.createElement('div');
            imageBox.className = 'image-box';
            imageBox.innerHTML = `
                <h3>${img.title}</h3>
                <img src="${img.url}" alt="${img.title}" 
                     onerror="this.style.background='#ffcccc'; this.alt='Failed to load image'">
            `;
            container.appendChild(imageBox);
        });
        
    } catch (error) {
        showError('Failed to generate images: ' + error.message);
        container.innerHTML = '';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded, setting up event listeners...');
    
    // Add event listeners to buttons
    document.getElementById('getHexagonBtn').addEventListener('click', getHexagon);
    document.getElementById('generateImagesBtn').addEventListener('click', generateImages);
    
    // Generate initial images if we have a hexagon ID
    if (document.getElementById('hexagonId').value) {
        generateImages();
    }
}); 