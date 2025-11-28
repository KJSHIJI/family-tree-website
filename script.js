let uploadedFiles = [];

// Handle file upload and preview
document.getElementById('fileInput').addEventListener('change', function (e) {
    uploadedFiles = Array.from(e.target.files).slice(0, 50); // Limit to 50 files
    const previewDiv = document.getElementById('preview');
    previewDiv.innerHTML = '';

    uploadedFiles.forEach(file => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        previewDiv.appendChild(img);
    });
});

// Generate tree nodes with name and relation inputs
function generateTree() {
    const treeDiv = document.getElementById('tree');
    treeDiv.innerHTML = '';

    // Create levels for hierarchy
    const level1 = document.createElement('div');
    level1.className = 'level';
    const level2 = document.createElement('div');
    level2.className = 'level';
    const level3 = document.createElement('div');
    level3.className = 'level';

    uploadedFiles.forEach((file, index) => {
        const node = document.createElement('div');
        node.className = 'node';
        node.innerHTML = `
            ${URL.createObjectURL(file)}
            <input type="text" placeholder="Enter Name" id="name-${index}">
            <input type="text" placeholder="Enter Relation" id="relation-${index}">
        `;

        // Simple logic for hierarchy: first 2 → grandparents, next 4 → parents, rest → children
        if (index < 2) {
            level1.appendChild(node);
        } else if (index < 6) {
            level2.appendChild(node);
        } else {
            level3.appendChild(node);
        }
    });

    // Append levels with connectors
    treeDiv.appendChild(level1);

    const connector1 = document.createElement('div');
    connector1.className = 'connector';
    treeDiv.appendChild(connector1);

    treeDiv.appendChild(level2);

    const connector2 = document.createElement('div');
    connector2.className = 'connector';
    treeDiv.appendChild(connector2);

    treeDiv.appendChild(level3);
}