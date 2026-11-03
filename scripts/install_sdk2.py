import subprocess

sdk_root = r'D:\Android\Sdk'
sdkmanager = rf'{sdk_root}\cmdline-tools\latest\bin\sdkmanager.bat'
packages = ['build-tools;35.0.0', 'build-tools;36.0.0', 'platform-tools', 'platforms;android-36']

for pkg in packages:
    print(f'Installing {pkg}...')
    for attempt in range(3):
        proc = subprocess.Popen(
            ['cmd', '/c', f'echo y | "{sdkmanager}" --sdk_root={sdk_root} "{pkg}"'],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        rc = proc.wait(timeout=180)
        if rc == 0:
            print(f'  OK')
            break
        else:
            print(f'  attempt {attempt+1} failed (rc={rc})')
    else:
        print(f'  FAILED after 3 attempts')

print('\nAll done!')
