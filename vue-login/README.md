# Vue Login Admin

这个项目现在是一套完整的前后端登录后台示例：

- 首页支持登录和注册
- 登录后进入后台首页，展示实时在线人数、浏览次数、用户数、今日登录次数
- 左侧功能栏支持首页、个人中心和动态新增功能页
- 个人中心支持修改头像、昵称、账号、密码、个人简介

## 启动方式

```powershell
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`
后端默认运行在 `http://localhost:3001`

## 数据库

MySQL 连接信息来自 `.env`。

后端启动时会自动创建：

- 数据库：`vue_login`
- 用户表：`users`
- 会话表：`user_sessions`
- 页面浏览表：`page_views`
- 功能页表：`feature_pages`

## 默认账号

- 用户名：`admin`
- 密码：`123456`

## 主要接口

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `POST /api/session/heartbeat`
- `GET /api/bootstrap`
- `POST /api/views`
- `PUT /api/profile`
- `GET /api/pages`
- `POST /api/pages`
