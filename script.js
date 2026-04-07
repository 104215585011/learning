const form = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const message = document.getElementById("message");

function setMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    setMessage("用户名和密码不能为空。", "error");
    return;
  }

  if (password.length < 6) {
    setMessage("密码长度不能少于 6 位。", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "登录中...";
  setMessage("", "");

  // 模拟登录请求
  setTimeout(() => {
    setMessage(`登录成功，欢迎你：${username}`, "success");
    submitBtn.disabled = false;
    submitBtn.textContent = "登录";
  }, 800);
});
