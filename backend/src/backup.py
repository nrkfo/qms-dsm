import sqlite3
import os

def run_backup():
    # src directory where this file resides
    src_dir = os.path.dirname(os.path.abspath(__file__))
    # backend directory (parent of src)
    backend_dir = os.path.dirname(src_dir)
    
    db_path = os.path.join(backend_dir, 'database.sqlite')
    backups_dir = os.path.join(backend_dir, 'backups')
    
    if not os.path.exists(backups_dir):
        os.makedirs(backups_dir)
        
    temp_backup_path = os.path.join(backups_dir, 'backup_temp.sqlite')
    final_backup_path = os.path.join(backups_dir, 'backup_latest.sqlite')
    
    print(f"Starting database backup from {db_path} to {temp_backup_path}")
    
    try:
        if not os.path.exists(db_path):
            print(f"Error: Source database file not found at {db_path}")
            return
            
        # Connect to source and destination databases
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(temp_backup_path)
        
        # Perform C-level page-by-page backup
        with dst:
            src.backup(dst)
            
        src.close()
        dst.close()
        
        # Atomically replace the final backup file
        if os.path.exists(final_backup_path):
            os.remove(final_backup_path)
        os.rename(temp_backup_path, final_backup_path)
        print(f"Backup completed successfully: {final_backup_path}")
        
        # Clean up any other files in the backups folder, keeping only backup_latest.sqlite
        for filename in os.listdir(backups_dir):
            file_path = os.path.join(backups_dir, filename)
            if os.path.isfile(file_path) and filename != 'backup_latest.sqlite':
                try:
                    os.remove(file_path)
                    print(f"Deleted old backup file/temp: {filename}")
                except Exception as e:
                    print(f"Failed to delete old backup file {filename}: {e}")
                    
    except Exception as e:
        print(f"Backup failed: {e}")
        if os.path.exists(temp_backup_path):
            try:
                os.remove(temp_backup_path)
            except:
                pass

if __name__ == '__main__':
    run_backup()
