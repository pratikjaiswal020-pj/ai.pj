import sqlite3
import bcrypt

def reset_password(email, new_password):
    try:
        conn = sqlite3.connect('chatbot.db')
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE email = ?;", (email,))
        user = cursor.fetchone()
        
        if not user:
            print(f"Error: User with email {email} not found.")
            return

        # Hash new password
        hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
        
        # Update password
        cursor.execute("UPDATE users SET password_hash = ? WHERE email = ?;", (hashed, email))
        conn.commit()
        print(f"Successfully reset password for {email} to: {new_password}")
        
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    reset_password('pratikjaiswal020@gmail.com', 'password123')
