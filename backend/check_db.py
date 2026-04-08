import sqlite3

def check_users():
    try:
        conn = sqlite3.connect('chatbot.db')
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users';")
        if not cursor.fetchone():
            print("Table 'users' does not exist.")
            return

        cursor.execute("SELECT email, username FROM users;")
        rows = cursor.fetchall()
        if not rows:
            print("No users found in the database.")
        else:
            print("Found users:")
            for row in rows:
                print(f"Email: {row[0]}, Username: {row[1]}")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_users()
