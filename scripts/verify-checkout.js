const VALID_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTIsInJvbGUiOiJlbXBsb3llZSIsImVtYWlsIjoiZW1wbG95ZWVAZXhhbXBsZS5jb20iLCJpYXQiOjE3NjkyNzc4MDMsImV4cCI6MTc2OTMwNjYwM30.CuWcwePAvwnZYyIsP9lzTdbSTT6rSrAA3ywn7tJI37I";

async function verify() {
    try {
        // Assuming the server is running on localhost:5001 as per .env
        const url = 'http://localhost:5001/api/attendance/clock-out';

        console.log(`Sending request to ${url} with null taskId...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${VALID_TOKEN}`
            },
            body: JSON.stringify({
                taskId: null,
                workNote: "Verification test specific - automated script"
            })
        });

        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Response:", text);

        if (response.status === 200) {
            console.log("SUCCESS: Checkout successful with null taskId.");
        } else {
            console.log("FAILURE: Checkout failed.");
        }

    } catch (e) {
        console.error("Script Error:", e.message);
    }
}

verify();
