import express from 'express';
const router = express.Router();

// GET /signup - Signup page
router.get('/', (req, res) => {
  // Redirect if already logged in
  if (req.session && req.session.customerId) {
    return res.redirect(`/api/dashboard/${req.session.customerId}`);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sign Up - Auto Reply Chat</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          width: 100%;
          max-width: 450px;
        }
        h1 { 
          color: #1f2937;
          margin-bottom: 8px;
          font-size: 28px;
        }
        .subtitle {
          color: #6b7280;
          margin-bottom: 30px;
          font-size: 14px;
        }
        label {
          display: block;
          color: #374151;
          font-weight: 500;
          margin-bottom: 6px;
          font-size: 14px;
        }
        input {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 16px;
          margin-bottom: 16px;
          transition: border-color 0.2s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .password-requirements {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #6b7280;
        }
        .password-requirements ul {
          margin-left: 20px;
          margin-top: 6px;
        }
        .password-requirements li {
          margin-bottom: 4px;
        }
        button {
          width: 100%;
          background: #667eea;
          color: white;
          padding: 14px;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover { background: #5568d3; }
        button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        .error {
          background: #fee2e2;
          color: #991b1b;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
          display: none;
        }
        .error.show { display: block; }
        .login-link {
          text-align: center;
          margin-top: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .login-link a {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
        }
        .login-link a:hover { text-decoration: underline; }
        .loading { display: none; }
        .loading.show { display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Create Account</h1>
        <p class="subtitle">Start building your AI chatbot today</p>
        
        <div id="error" class="error"></div>
        
        <form id="signupForm">
          <div>
            <label for="name">Full Name</label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              required 
              minlength="2"
              placeholder="John Doe"
            />
          </div>
          
          <div>
            <label for="email">Email Address</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>
          
          <div>
            <label for="businessEmail">Business Email (for notifications)</label>
            <input 
              type="email" 
              id="businessEmail" 
              name="businessEmail" 
              required 
              autocomplete="email"
              placeholder="notifications@yourbusiness.com"
            />
          </div>
          
          <div>
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              required 
              minlength="8"
              autocomplete="new-password"
              placeholder="Create a strong password"
            />
          </div>
          
          <div class="password-requirements">
            <strong>Password must contain:</strong>
            <ul>
              <li>At least 8 characters</li>
              <li>One uppercase letter</li>
              <li>One lowercase letter</li>
              <li>One number</li>
              <li>One special character (!@#$%^&*)</li>
            </ul>
          </div>
          
          <button type="submit" id="submitBtn">
            <span class="btn-text">Create Account</span>
            <span class="loading">Creating account...</span>
          </button>
        </form>
        
        <div class="login-link">
          Already have an account? <a href="/login">Sign in</a>
        </div>
      </div>
      
      <script>
        const form = document.getElementById('signupForm');
        const errorDiv = document.getElementById('error');
        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const loading = submitBtn.querySelector('.loading');
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          errorDiv.classList.remove('show');
          submitBtn.disabled = true;
          btnText.style.display = 'none';
          loading.classList.add('show');
          
          const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            businessEmail: document.getElementById('businessEmail').value,
            password: document.getElementById('password').value
          };
          
          try {
            const response = await fetch('/api/auth/signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (response.ok) {
              // Success - redirect to dashboard
              window.location.href = '/api/dashboard/' + data.customerId;
            } else {
              // Show error
              errorDiv.textContent = data.error || 'Signup failed';
              errorDiv.classList.add('show');
              submitBtn.disabled = false;
              btnText.style.display = 'inline';
              loading.classList.remove('show');
            }
          } catch (error) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.classList.add('show');
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            loading.classList.remove('show');
          }
        });
      </script>
    </body>
    </html>
  `);
});

export default router;
