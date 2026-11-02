package br.com.nexorconsultingit.ponto;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin próprio: chave do ponto no chip de segurança do celular
        registerPlugin(ChaveSeguraPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
