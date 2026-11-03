import subprocess, os, time

os.environ['JAVA_HOME'] = r'D:\JDK-21'
sdk_root = r'D:\Android\Sdk'
sdkmanager = rf'{sdk_root}\cmdline-tools\latest\bin\sdkmanager.bat'
packages = ['build-tools;35.0.0', 'build-tools;36.0.0', 'platform-tools', 'platforms;android-36']

# Accept all licenses
print("=== Accepting licenses ===")
proc = subprocess.Popen(
    [sdkmanager, '--licenses', f'--sdk_root={sdk_root}'],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    text=True, bufsize=0,
)
try:
    out, _ = proc.communicate(input='\n'.join(['y'] * 50) + '\n', timeout=30)
    print(out[-500:] if out else '(no output)')
except subprocess.TimeoutExpired:
    proc.kill()
    print('timed out')

# Install packages
for pkg in packages:
    print(f'\n=== Installing {pkg} ===')
    proc = subprocess.Popen(
        [sdkmanager, pkg, f'--sdk_root={sdk_root}'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=0,
    )
    try:
        out, _ = proc.communicate(input='y\ny\ny\ny\ny\n', timeout=180)
        last_lines = '\n'.join(out.split('\n')[-5:])
        print(last_lines)
    except subprocess.TimeoutExpired:
        proc.kill()
        print('TIMED OUT')
