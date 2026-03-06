const axios = require('axios');

async function check() {
    try {
        const res = await axios.get('http://localhost:5000/api/slots/assets/0449625468');
        console.log("Assets fetched:", res.data.length);
        if (res.data.length > 0) {
            console.log("Sample:", res.data.slice(0, 2));
        }
    } catch (err) {
        console.error("Error:", err.message);
    }
}
check();
