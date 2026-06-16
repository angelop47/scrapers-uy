export async function fetchEvents() {
    try {
        const response = await fetch('/api/events');
        return await response.json();
    } catch (error) {
        console.error('Error fetching events:', error);
        return null;
    }
}

export async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        return await response.json();
    } catch (error) {
        console.error('Error fetching stats:', error);
        return null;
    }
}

export async function fetchEconomy() {
    try {
        const response = await fetch('/api/economy');
        return await response.json();
    } catch (error) {
        console.error('Error fetching economy:', error);
        return null;
    }
}
