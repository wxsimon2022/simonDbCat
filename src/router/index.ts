import { createRouter, createMemoryHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/connections',
  },
  {
    path: '/connections',
    name: 'Connections',
    component: () => import('../views/Connections.vue'),
  },
  {
    path: '/dashboard/:connId',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    props: true,
  },
  {
    path: '/query/:connId',
    name: 'Query',
    component: () => import('../views/Query.vue'),
    props: true,
  },
  {
    path: '/table/:connId/:tableName',
    name: 'TableDetail',
    component: () => import('../views/TableDetail.vue'),
    props: true,
  },
]

export default createRouter({
  history: createMemoryHistory(),
  routes,
})
