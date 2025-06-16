# Logo 文件放置说明

## 🎨 当前使用CSS Logo

目前网站使用CSS生成的logo，风格与页面完美匹配：
- 页面logo：CSS生成的渐变"S"字母
- Favicon：需要手动生成

## 📂 Favicon 生成方法

### 方法1：使用生成页面（推荐）
1. 在浏览器中访问：`http://localhost:5173/generate-favicon.html`
2. 按照页面说明截图生成favicon
3. 保存为 `favicon.ico` 并放置在 `client/public/` 目录

### 方法2：在线工具
推荐使用以下在线工具：
- [favicon.io](https://favicon.io/) - 免费favicon生成器
- [convertio.co](https://convertio.co/) - 在线格式转换
- [favicon-generator.org](https://favicon-generator.org/) - 专业favicon生成

## 🎯 如果需要切换回图片Logo

如果您想使用图片logo替换CSS版本：

1. 将logo图片重命名为 `logo.png` 并放到 `client/public/`
2. 修改 `client/src/App.vue` 中的代码：
   ```html
   <!-- 将这行 -->
   <div class="logo-icon">S</div>
   <!-- 改为 -->
   <img src="/logo.png" alt="Switch Service" class="brand-logo" />
   ```

## ✨ 当前效果

- 浏览器标题栏：需要手动更新favicon.ico
- 页面顶部：蓝绿渐变"S"字母logo，与页面风格完美匹配 