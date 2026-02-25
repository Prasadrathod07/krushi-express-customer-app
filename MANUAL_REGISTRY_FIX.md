# Manual Windows Registry Fix for File Watcher

## Method 1: Using Registry Editor (GUI) - EASIEST

1. **Open Registry Editor:**
   - Press `Win + R`
   - Type `regedit` and press Enter
   - Click "Yes" when prompted for admin permission

2. **Navigate to:**
   ```
   HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\FileSystem
   ```

3. **Create New Value:**
   - Right-click in the right panel
   - Select "New" → "DWORD (32-bit) Value"
   - Name it: `MaxWatchers`
   - Double-click it and set Value data to: `524288`
   - Click OK

4. **Restart your computer**

5. **After restart, try:**
   ```powershell
   npm start
   ```

## Method 2: Using PowerShell (Command Line)

**Make sure PowerShell is running as Administrator:**

1. Right-click on PowerShell icon
2. Select "Run as Administrator"
3. Run this command:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "MaxWatchers" -Value 524288 -PropertyType DWORD -Force
```

4. **Restart your computer**

5. **After restart:**
   ```powershell
   npm start
   ```

## Method 3: Alternative Registry Path

If the above doesn't work, try this path:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\SubSystems" -Name "Windows" -PropertyType ExpandString -Force
```

Then modify the `Windows` value to include `SharedSection=1024,20480,1024` (increase the last number from 768 to 1024).

## Verification

After restart, you can verify the setting:

```powershell
Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "MaxWatchers"
```

It should show `MaxWatchers : 524288`

## If Registry Fix Doesn't Work

**Move project to local drive:**
- Copy project from `Y:\` to `C:\Projects\Krushi-Express-Latur\customer-app-v2`
- Then `npm start` should work


