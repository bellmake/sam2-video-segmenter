document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const interactionSection = document.getElementById('interaction-section');
    const sourceVideo = document.getElementById('source-video');
    const canvas = document.getElementById('interaction-canvas');
    const ctx = canvas.getContext('2d');
    const pointsUl = document.getElementById('points-ul');
    const clearPointsBtn = document.getElementById('clear-points');
    const segmentBtn = document.getElementById('segment-btn');
    const loadingSection = document.getElementById('loading-section');
    const resultsSection = document.getElementById('results-section');
    const originalResultVideo = document.getElementById('original-result-video');
    const segmentedResultVideo = document.getElementById('segmented-result-video');
    const resetBtn = document.getElementById('reset-btn');

    let selectedPoints = [];
    let videoFile = null;
    let scaleFactor = 1;

    // Handle video upload
    videoUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            videoFile = file;
            const url = URL.createObjectURL(file);
            sourceVideo.src = url;

            // Wait for metadata to load to get dimensions
            sourceVideo.onloadedmetadata = () => {
                // Set canvas dimensions to match video (or scaled down if too large)
                const maxWidth = 800;
                scaleFactor = Math.min(1, maxWidth / sourceVideo.videoWidth);

                canvas.width = sourceVideo.videoWidth * scaleFactor;
                canvas.height = sourceVideo.videoHeight * scaleFactor;

                // Seek to first frame (0.1s to be safe)
                sourceVideo.currentTime = 0.1;
            };

            // Draw frame to canvas when seeked
            sourceVideo.onseeked = () => {
                ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
                interactionSection.style.display = 'block';
                document.querySelector('.upload-section').style.display = 'none';
            };
        }
    });

    // Handle clicks on canvas
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        // Convert back to original video coordinates
        const originalX = Math.round(x / scaleFactor);
        const originalY = Math.round(y / scaleFactor);

        selectedPoints.push([originalX, originalY]);

        // Draw point on canvas
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Add to list
        updatePointsList();
    });

    function updatePointsList() {
        pointsUl.innerHTML = '';
        selectedPoints.forEach((point, index) => {
            const li = document.createElement('li');
            li.textContent = `Point ${index + 1}: [${point[0]}, ${point[1]}]`;
            pointsUl.appendChild(li);
        });
    }

    // Clear points
    clearPointsBtn.addEventListener('click', () => {
        selectedPoints = [];
        updatePointsList();
        // Redraw frame
        ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
    });

    // Segment Video
    segmentBtn.addEventListener('click', async () => {
        if (selectedPoints.length === 0) {
            alert('Please select at least one point.');
            return;
        }

        interactionSection.style.display = 'none';
        loadingSection.style.display = 'block';

        const formData = new FormData();
        formData.append('video', videoFile);

        // Format coordinates as string "[x,y],[x,y]"
        const coordsString = selectedPoints.map(p => `[${p[0]},${p[1]}]`).join(',');
        formData.append('click_coordinates', coordsString);

        // Generate object IDs (bee_1, bee_2, etc. - using mouse_ for this context)
        const objectIds = selectedPoints.map((_, i) => `mouse_${i + 1}`).join(',');
        formData.append('click_object_ids', objectIds);

        // Click frames (all 1 for now, assuming first frame)
        // The API expects a comma separated list of frame indices corresponding to each click
        // If we only click on the first frame, we should pass "0" (or "1" if 1-indexed? Replicate example used "1")
        // The example used "1". Let's assume 1-based or just follow the example.
        // Actually, let's check the example again. "click_frames": "1". It seems it might be a single value if it applies to all? 
        // Or maybe it's "1,1,1,1..."
        // The example input: "click_frames": "1", "click_object_ids": "bee_1,bee_2...", "click_coordinates": "[...],[...]"
        // It seems "click_frames" might be a single number if all clicks are on that frame, OR it matches the length.
        // Let's try sending "1" as in the example.
        formData.append('click_frames', "1");

        try {
            const response = await fetch('/api/segment', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Segmentation failed');
            }

            const data = await response.json();

            if (data.output_video) {
                loadingSection.style.display = 'none';
                resultsSection.style.display = 'block';

                originalResultVideo.src = URL.createObjectURL(videoFile);
                segmentedResultVideo.src = data.output_video;

                // Update download button
                const downloadBtn = document.getElementById('download-btn');
                downloadBtn.href = data.output_video;
            } else {
                throw new Error('No output video URL returned');
            }
        } catch (error) {
            console.error(error);
            alert('An error occurred: ' + error.message);
            loadingSection.style.display = 'none';
            interactionSection.style.display = 'block';
        }
    });

    // Reset
    resetBtn.addEventListener('click', () => {
        resultsSection.style.display = 'none';
        document.querySelector('.upload-section').style.display = 'flex';
        selectedPoints = [];
        updatePointsList();
        videoFile = null;
        sourceVideo.src = '';
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
});
