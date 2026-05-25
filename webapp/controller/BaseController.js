sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent"
], function(Controller, UIComponent) {
	"use strict";

	return Controller.extend("zgpms.meilpower.com.controller.BaseController", {

		/**
		 * Convenience method for accessing the router.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter : function () {
			return UIComponent.getRouterFor(this);
		},

		/**
		 * Convenience method for getting the view model by name.
		 * @public
		 * @param {string} [sName] the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel : function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.core.mvc.View} the view instance
		 */
		setModel : function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Returns a promises which resolves with the resource bundle value of the given key <code>sI18nKey</code>
		 *
		 * @public
		 * @param {string} sI18nKey The key
		 * @param {sap.ui.core.model.ResourceModel} oResourceModel The resource model
		 * @param {string[]} [aPlaceholderValues] The values which will repalce the placeholders in the i18n value
		 * @returns {Promise<string>} The promise
		 */
		getBundleTextByModel: function(sI18nKey, oResourceModel, aPlaceholderValues){
			return oResourceModel.getResourceBundle().then(function(oBundle){
				return oBundle.getText(sI18nKey, aPlaceholderValues);
			});
		},

		_mapMaterialType: function (sMaterial, sDescription) {
			sMaterial = (sMaterial || "").toUpperCase();
			sDescription = (sDescription || "").toUpperCase();
			
			// Valid dropdown keys
			var aValidKeys = ["Metal", "Rubber", "Oil", "Plastic", "Copper", "Batteries", "Spent Oil(Barrel Capacity)"];
			var sFound = aValidKeys.find(function(key) {
				return key.toUpperCase() === sMaterial;
			});
			if (sFound) {
				return sFound;
			}
			
			// Check description keywords
			if (sDescription.indexOf("COPPER") !== -1) return "Copper";
			if (sDescription.indexOf("BATTERY") !== -1 || sDescription.indexOf("BATTERIES") !== -1) return "Batteries";
			if (sDescription.indexOf("SPENT OIL") !== -1) return "Spent Oil(Barrel Capacity)";
			if (sDescription.indexOf("OIL") !== -1) return "Oil";
			if (sDescription.indexOf("RUBBER") !== -1) return "Rubber";
			if (sDescription.indexOf("PLASTIC") !== -1) return "Plastic";
			if (sDescription.indexOf("SCRAP") !== -1 || sDescription.indexOf("METAL") !== -1 || sDescription.indexOf("MS") !== -1) return "Metal";
			
			// Check material key keywords
			if (sMaterial.indexOf("COPPER") !== -1) return "Copper";
			if (sMaterial.indexOf("BATTERY") !== -1 || sMaterial.indexOf("BATTERIES") !== -1) return "Batteries";
			if (sMaterial.indexOf("SPENT") !== -1) return "Spent Oil(Barrel Capacity)";
			if (sMaterial.indexOf("OIL") !== -1) return "Oil";
			if (sMaterial.indexOf("RUBBER") !== -1) return "Rubber";
			if (sMaterial.indexOf("PLASTIC") !== -1) return "Plastic";
			if (sMaterial.indexOf("SCRAP") !== -1 || sMaterial.indexOf("METAL") !== -1 || sMaterial.indexOf("MS") !== -1) return "Metal";
			
			return "Metal"; // Default fallback
		}
	});

});