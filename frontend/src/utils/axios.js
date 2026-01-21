import axios from 'axios';
import router from '../router';
import { ElMessage } from 'element-plus';

const service = axios.create({
  baseURL: import.meta.env.BASE_URL, 
  timeout: 10000
});

service.interceptors.request.use(config => {
  if (config.url?.startsWith('/')) {
    config.url = config.url.substring(1);
  }
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}, error => {
  return Promise.reject(error);
});

service.interceptors.response.use(response => {
  return response;
}, error => {
  if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      localStorage.removeItem('token');
      router.push('/login');
  }
  ElMessage.error(error.response?.data?.message || error.message || 'Request Error');
  return Promise.reject(error);
});

export default service;
