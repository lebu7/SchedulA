// This is just the updated fetchServices function
const fetchServices = async () => {
  try {
    const response = await api.get('/my-services');
    setServices(response.data);
  } catch (error) {
    console.error('Error fetching services:', error);
    // If unauthorized, try public endpoint
    const publicResponse = await api.get('/services');
    setServices(publicResponse.data);
  }
};