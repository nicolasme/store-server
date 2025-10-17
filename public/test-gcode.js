// G-Code Generation Test

function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('message');
    messageDiv.className = type;
    messageDiv.textContent = message;
    
    if (type === 'info') {
        setTimeout(() => {
            messageDiv.textContent = '';
            messageDiv.className = '';
        }, 3000);
    }
}

function getParameters() {
    return {
        strategy: document.getElementById('strategy').value,
        endmillDiameter: document.getElementById('endmillDiameter').value,
        feedRate: document.getElementById('feedRate').value,
        spindleSpeed: document.getElementById('spindleSpeed').value,
        stepOver: document.getElementById('stepOver').value,
        depthPerPass: document.getElementById('depthPerPass').value,
        maxDepth: document.getElementById('maxDepth').value
    };
}

function getContourParameters() {
    return {
        endmillDiameter: document.getElementById('endmillDiameter').value,
        feedRate: document.getElementById('feedRate').value,
        spindleSpeed: document.getElementById('spindleSpeed').value,
        cutDepth: document.getElementById('cutDepth').value,
        depthPerPass: document.getElementById('depthPerPass').value,
        offset: document.getElementById('offset').value,
        hexagonSize: document.getElementById('hexagonSize').value
    };
}

async function getPreview() {
    const hexagonId = document.getElementById('hexagonId').value;
    if (!hexagonId) {
        showMessage('Please enter a hexagon ID', 'error');
        return;
    }
    
    try {
        showMessage('Getting preview...');
        const response = await fetch(`/api/h3/${hexagonId}/gcode/preview`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to get preview');
        }
        
        const previewDiv = document.getElementById('preview');
        const contentDiv = document.getElementById('previewContent');
        
        contentDiv.innerHTML = `
            <p><strong>Hexagon:</strong> ${data.h3Index}</p>
            <p><strong>Center:</strong> ${data.center.lat.toFixed(4)}, ${data.center.lng.toFixed(4)}</p>
            <p><strong>Elevation Range:</strong> ${data.elevationRange.min}m - ${data.elevationRange.max}m</p>
            <hr>
            <p><strong>Tool:</strong> ${data.machining.tool}</p>
            <p><strong>Workpiece:</strong> ${data.machining.workpieceSize}</p>
            <p><strong>Max Depth:</strong> ${data.machining.maxDepth}</p>
            <p><strong>Passes:</strong> ${data.machining.passes}</p>
            <p><strong>Feed Rate:</strong> ${data.machining.feedRate}</p>
            <p><strong>Spindle Speed:</strong> ${data.machining.spindleSpeed}</p>
            <hr>
            <p><strong>Estimated Time:</strong> ${data.machining.estimatedTime.formatted}</p>
        `;
        
        previewDiv.style.display = 'block';
        showMessage('Preview loaded successfully', 'info');
        
    } catch (error) {
        showMessage('Failed to get preview: ' + error.message, 'error');
    }
}

async function generateGCode() {
    const hexagonId = document.getElementById('hexagonId').value;
    if (!hexagonId) {
        showMessage('Please enter a hexagon ID', 'error');
        return;
    }
    
    try {
        showMessage('Generating G-Code...');
        const params = getParameters();
        const queryString = new URLSearchParams({ ...params, download: 'false' }).toString();
        
        const response = await fetch(`/api/h3/${hexagonId}/gcode?${queryString}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate G-Code');
        }
        
        const gcode = await response.text();
        const lines = gcode.split('\n');
        
        const gcodeContainer = document.getElementById('gcodeContainer');
        const gcodePreview = document.getElementById('gcodePreview');
        
        // Show first 100 lines
        gcodePreview.textContent = lines.slice(0, 100).join('\n');
        if (lines.length > 100) {
            gcodePreview.textContent += '\n\n... (showing first 100 of ' + lines.length + ' lines) ...';
        }
        
        gcodeContainer.style.display = 'block';
        showMessage('G-Code generated successfully', 'info');
        
    } catch (error) {
        showMessage('Failed to generate G-Code: ' + error.message, 'error');
    }
}

async function downloadGCode() {
    const hexagonId = document.getElementById('hexagonId').value;
    if (!hexagonId) {
        showMessage('Please enter a hexagon ID', 'error');
        return;
    }
    
    try {
        showMessage('Downloading G-Code...');
        const params = getParameters();
        const queryString = new URLSearchParams(params).toString();
        
        // Create download link
        const link = document.createElement('a');
        link.href = `/api/h3/${hexagonId}/gcode?${queryString}`;
        link.download = `${hexagonId}-${params.strategy}.gcode`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Download started', 'info');
        
    } catch (error) {
        showMessage('Failed to download G-Code: ' + error.message, 'error');
    }
}

async function generateContour() {
    const hexagonId = document.getElementById('hexagonId').value;
    if (!hexagonId) {
        showMessage('Please enter a hexagon ID', 'error');
        return;
    }
    
    try {
        showMessage('Generating contour G-Code...');
        const params = getContourParameters();
        const queryString = new URLSearchParams({ ...params, download: 'false' }).toString();
        
        const response = await fetch(`/api/h3/${hexagonId}/gcode/contour?${queryString}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate contour G-Code');
        }
        
        const gcode = await response.text();
        const lines = gcode.split('\n');
        
        const gcodeContainer = document.getElementById('gcodeContainer');
        const gcodePreview = document.getElementById('gcodePreview');
        
        // Show all lines for contour (it's usually short)
        gcodePreview.textContent = gcode;
        
        gcodeContainer.style.display = 'block';
        showMessage('Contour G-Code generated successfully', 'info');
        
    } catch (error) {
        showMessage('Failed to generate contour G-Code: ' + error.message, 'error');
    }
}

async function downloadContour() {
    const hexagonId = document.getElementById('hexagonId').value;
    if (!hexagonId) {
        showMessage('Please enter a hexagon ID', 'error');
        return;
    }
    
    try {
        showMessage('Downloading contour G-Code...');
        const params = getContourParameters();
        const queryString = new URLSearchParams(params).toString();
        
        // Create download link
        const link = document.createElement('a');
        link.href = `/api/h3/${hexagonId}/gcode/contour?${queryString}`;
        link.download = `${hexagonId}-contour.gcode`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Contour download started', 'info');
        
    } catch (error) {
        showMessage('Failed to download contour G-Code: ' + error.message, 'error');
    }
}

async function getTestGCode() {
    try {
        showMessage('Downloading test G-Code...');
        
        // Create download link
        const link = document.createElement('a');
        link.href = '/api/gcode/test';
        link.download = 'test.gcode';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Test G-Code downloaded', 'info');
        
    } catch (error) {
        showMessage('Failed to download test G-Code: ' + error.message, 'error');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('G-Code test page loaded');
}); 