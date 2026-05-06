sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.GatePassCreation", {
		formatter: {
			formatHsnCodeDesc: function (sCode, sDesc) {
				if (sCode && sDesc) {
					return sCode + " - " + sDesc;
				}
				return sCode || sDesc || "";
			},
			formatMaterial: function (sCode, sName) {
				if (sCode && sName) {
					return sCode + " - " + sName;
				}
				return sCode || sName || "";
			}
		},

		onMaterialValueHelp: function (oEvent) {

			this._oInputSource = oEvent.getSource();
			this._oRowContext = this._oInputSource.getBindingContext("gp");
			 var oGpModel = this.getView().getModel("gp");
             var sPlant = oGpModel.getProperty("/Plant");

			 if(!sPlant){
				console.log('please selct plant first')
			 sap.m.MessageToast.show("Please select plant first");
			 return;
			 }

			if (!this._pMaterialValueHelp) {
				this._pMaterialValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.MaterialValueHelp",
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			this._pMaterialValueHelp.then(function (oDialog) {
				oDialog.getBinding("items").filter([]);
				oDialog.open();
			});
		},

		onMaterialValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new sap.ui.model.Filter({
				filters: [
					new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.Contains, sValue),
					new sap.ui.model.Filter("MaterialName", sap.ui.model.FilterOperator.Contains, sValue),
					new sap.ui.model.Filter("HsnDesc", sap.ui.model.FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onMaterialValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedMaterial = oSelectedItem.getBindingContext("materials").getObject();
			var oModel = this.getView().getModel("gp");
			var sPath = this._oRowContext.getPath();

			oModel.setProperty(sPath + "/material", oSelectedMaterial.Material);
			oModel.setProperty(sPath + "/materialName", oSelectedMaterial.MaterialName);
			oModel.setProperty(sPath + "/hsnCode", oSelectedMaterial.HsnCode);
			oModel.setProperty(sPath + "/hsnDesc", oSelectedMaterial.HsnDesc);
			oModel.setProperty(sPath + "/uom", oSelectedMaterial.UOM);
			oModel.setProperty(sPath + "/rate", oSelectedMaterial.UnitPrice);
			
			// Recalculate amount for this row
			var fQty = parseFloat(oModel.getProperty(sPath + "/quantity")) || 0;
			var fRate = parseFloat(oSelectedMaterial.UnitPrice) || 0;
			var fAmount = fQty * fRate;
			oModel.setProperty(sPath + "/amount", fAmount.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
			this._recalcTotal();
			
			this._oInputSource.setValueState("None");
		},

		onMaterialValueHelpCancel: function () {
			// Do nothing
		},

		onInit: function () {
			this._resetModel();
			
			var oODataModel = this.getOwnerComponent().getModel();
			if (oODataModel) {
				oODataModel.metadataLoaded().then(function() {
					this._loadPlants();
					this._loadVendors();
					this._loadMaterials();
				}.bind(this));
			} else {
				this._loadPlants();
				this._loadVendors();
				this._loadMaterials();
			}

			this.getRouter().getRoute("GatePassCreation").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var oArgs = oEvent.getParameter("arguments");
			var sType = oArgs ? oArgs.type : null;
			
			// Reset model on tab switch
			this._resetModel();
			
			var oModel = this.getView().getModel("gp");
			if (oModel) {
				if (sType) {
					oModel.setProperty("/GatePassType", sType);
					oModel.setProperty("/isTypeEditable", false);
				} else {
					oModel.setProperty("/GatePassType", "");
					oModel.setProperty("/isTypeEditable", true);
				}
			}
		},

		_loadPlants: function () {
			var oPlantModel = new JSONModel({
				results: []
			});
			this.getView().setModel(oPlantModel, "plants");

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZPlantSet", {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var aNormalized = aResults.map(function (p) {
						return {
							Plant: p.Plant || p.Matnr || "",
							PlantName: p.PlantName || p.Pname || p.Name1 || p.Plantname || p.Plant || "",
							CoCode: p.CoCode || p.CompanyCode || "",
							UOM: p.Meins || p.Uom || p.BaseUOM || ""
						};
					});
					oPlantModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					console.error("Failed to load plants from OData", oError);
					var sMsg = "OData Error: Could not fetch Plants from ZPlantSet.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg += "\nDetails: " + (oResp.error.message.value || oResp.error.message || "Unknown error");
					} catch (e) {}
					MessageBox.error(sMsg);
				}
			});
		},

		_resetModel: function () {
			var oViewModel = new JSONModel({
				GatePassReqNo: "",
				GatePassType: "",
				isTypeEditable: true,
				Cocode: "",
				Plant: "",
				FiscalYear: String(new Date().getFullYear()),
				// gpDate: new Date(),
				returnableDate: new Date(),
				vendor: "",
				vendorName: "",
				vendorAddress: "",
				vendorGST: "",
				fileName: "",
				Department: "",
				items: [
					this._newItem(1)
				],
				remarks: "",
				finalTotal: "0.00"
			});
			this.getView().setModel(oViewModel, "gp");
		},

		_newItem: function (iSno) {
			return {
				sno: String(iSno).padStart(2, '0'),
				material: "",
				hsnCode: "",
				hsnDesc: "",
				quantity: 1,
				uom: "",
				rate: 0,
				amount: "0.00"
			};
		},


		_loadMaterials: function (sPlant) {
			var oMaterialsModel = this.getView().getModel("materials");
			if (!oMaterialsModel) {
				oMaterialsModel = new JSONModel({ results: [] });
				this.getView().setModel(oMaterialsModel, "materials");
			}

			oMaterialsModel.setProperty("/results", []);

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			if (!sPlant) {
			  console.log("please select plant first")
			}
			var aFilters = [
				new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)
			];

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZMaterialSet", {
				filters: aFilters,
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length === 0) {
						console.warn("No materials found for plant " + sPlant);
						
						return;
					}
					var aNormalized = aResults.map(function (m) {
						return {
							Material: m.Material || m.Matnr || "",
							MaterialName: m.Maktx || m.MaterialDesc || m.Description || m.MatDesc || m.Materialtxt || m.Material || "",
							HsnDesc: m.HSNDesc || "",
							HsnCode: m.HSNCode || "",
							UOM: m.Meins || m.Uom || m.BaseUOM || m.UOM || "",
							UnitPrice: parseFloat(m.UnitPrice) || 0
						};
					});
					oMaterialsModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					console.error("Failed to fetch materials for plant " + sPlant, oError);
					var sMsg = "Failed to load materials for plant " + sPlant;
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg += "\nDetails: " + (oResp.error.message.value || oResp.error.message || "Unknown error");
					} catch (e) {
						if (oError.message) { sMsg += "\nMessage: " + oError.message; }
					}
					MessageBox.error(sMsg);
				}
			});
		},


	onPlantChange: function (oEvent) {
    var oSelectedItem = oEvent.getParameter("selectedItem");

    if (oSelectedItem) {
        var sKey = oSelectedItem.getKey();
		var isPlantSelected = true;
        var oGpModel = this.getView().getModel("gp");
         console.log(oGpModel)
        oGpModel.setProperty("/Plant", sKey);
        var aItems = oGpModel.getProperty("/items");
        aItems.forEach(function (item) {
            item.material = "";
            item.materialName = "";
            item.hsnCode = "";
            item.hsnDesc = "";
            item.uom = "";
            item.rate = 0;
            item.amount = "0.00";
        });
        oGpModel.setProperty("/items", aItems);
        this._recalcTotal();

        this._loadVendors(sKey);
        this._loadMaterials(sKey);
		

        sap.m.MessageToast.show("Materials refreshed for selected plant");
    }
},

onMaterialChange: function (oEvent) {

    var oGpModel = this.getView().getModel("gp");
    var sPlant = oGpModel.getProperty("/Plant");

    if (!sPlant) {
        console.log("❌ Please select plant first");
        sap.m.MessageToast.show("Please select Plant first");
        return;
    }

    var oSource = oEvent.getSource();
    var oContext = oSource.getBindingContext("gp");

    var oItem = oEvent.getParameter("selectedItem");
    var sKey = oItem ? oItem.getKey() : oSource.getValue();

    console.log("Selected Material:", sKey);

    var aMaterials = this.getView().getModel("materials").getProperty("/results");

    var oMaterial = aMaterials.find(function (m) {
        return m.Material === sKey;
    });

    if (oMaterial) {
        oContext.getModel().setProperty(oContext.getPath() + "/hsnCode", oMaterial.HsnCode);
        oContext.getModel().setProperty(oContext.getPath() + "/hsnDesc", oMaterial.HsnDesc || oMaterial.MaterialName);
        oContext.getModel().setProperty(oContext.getPath() + "/uom", oMaterial.UOM);
        oContext.getModel().setProperty(oContext.getPath() + "/rate", oMaterial.UnitPrice);

        // Recalculate amount for this row
        var fQty = parseFloat(oContext.getModel().getProperty(oContext.getPath() + "/quantity")) || 0;
        var fRate = parseFloat(oMaterial.UnitPrice) || 0;
        var fAmount = fQty * fRate;
        oContext.getModel().setProperty(oContext.getPath() + "/amount", fAmount.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }));
        this._recalcTotal();
    } else {
        console.log("❌ Material not found in list");
    }
},

		_loadVendors: function (sPlant) {
			var oVendorModel = new JSONModel({
				results: []
			});
			this.getView().setModel(oVendorModel, "vendors");

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			if (!sPlant) {
				sPlant = this.getView().getModel("gp").getProperty("/Plant") || "2301";
			}
			var aFilters = [
				new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)
			];

			oODataModel.read("/ZVendorSet", {
				filters: aFilters,
				success: function (oData) {
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var aNormalized = aResults.map(function (v) {
						return {
							Vendor: v.Vendor || v.Lifnr || "",
							VendorName: v.Name || v.VendorName || v.Name1 || "Unknown Vendor",
							Street: v.Address || v.Street || "",
							City: v.City || "",
							PostalCode: v.ZipCode || v.PostalCode || "",
							Country: v.Country || "",
							VendorGST: v.VendorGST || v.TaxNumber1 || ""
						};
					});
					oVendorModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					console.error("Failed to load vendors from OData, using fallback data", oError);
				}
			});
		},

		onVendorSelect: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (!oItem) { return; }

			var sKey = oItem.getKey();
			var aVendors = this.getView().getModel("vendors").getProperty("/results");
			var oVendor = aVendors.find(function (v) { return v.Vendor === sKey; });
			if (!oVendor) { return; }

			var sAddress = [oVendor.Street, oVendor.City, oVendor.PostalCode, oVendor.Country].filter(Boolean).join(", ");

			var oGp = this.getView().getModel("gp");
			oGp.setProperty("/vendorAddress", sAddress);
			oGp.setProperty("/vendorGST", oVendor.VendorGST);
		},

		onAddItem: function () {
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			aItems.push(this._newItem(aItems.length + 1));
			oGp.setProperty("/items", aItems);
		},

		onRemoveItem: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gp").getObject();
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			var iIndex = aItems.indexOf(oItem);
			if (iIndex > -1) {
				aItems.splice(iIndex, 1);
				// Renumber
				aItems.forEach(function (it, i) {
					it.sno = String(i + 1).padStart(2, '0');
				});
				oGp.setProperty("/items", aItems);
				this._recalcTotal();
			}
		},

		onQtyRateChange: function (oEvent) {
			var oSource = oEvent.getSource();
			var oContext = oSource.getBindingContext("gp");
			var oModel = this.getView().getModel("gp");

			// For live calculation, manually sync the value being typed to the model
			var sBindingPath = oSource.getBindingPath("value");
			if (sBindingPath) {
				oModel.setProperty(oContext.getPath() + "/" + sBindingPath, parseFloat(oSource.getValue()) || 0);
			}

			var oItem = oContext.getObject();
			var fQty = parseFloat(oItem.quantity) || 0;
			var fRate = parseFloat(oItem.rate) || 0;
			var fAmount = fQty * fRate;

			oModel.setProperty(oContext.getPath() + "/amount", fAmount.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));

			this._recalcTotal();
		},

		_recalcTotal: function () {
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			var fTotal = 0;

			aItems.forEach(function (it) {
				var fAmt = parseFloat(String(it.amount).replace(/,/g, '')) || 0;
				fTotal += fAmt;
			});

			oGp.setProperty("/finalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		onSubmit: function () {
    try {

        // ✅ Get data correctly
        var oGp = this.getView().getModel("gp").getData();
		

       

       
        if (!oGp.Plant) {
            sap.m.MessageBox.error("Please select Plant first");
            console.log('plant not selected')
            return;
        }

		if(!oGp.VehicleNo){
			console.log('vehicle is not  selected')
			 sap.m.MessageBox.error("Please select Vehicle Number");
			return;
		}


        var oVendorModel = this.getView().getModel("vendors");
        var aVendorList = (oVendorModel && oVendorModel.getProperty("/results")) || [];

        var oSelectedVendor = aVendorList.find(function (v) {
            return v.Vendor === oGp.vendor;
        }) || {};

        // ✅ Date formatting function
        var fnFormatDate = function (oDate) {
            if (!oDate) return "";

            if (typeof oDate === "string" && oDate.length === 8 && !isNaN(oDate)) {
                return oDate;
            }

            var d = (oDate instanceof Date) ? oDate : new Date(oDate);
            if (isNaN(d.getTime())) return "";

            var y = d.getFullYear();
            var m = String(d.getMonth() + 1).padStart(2, '0');
            var day = String(d.getDate()).padStart(2, '0');

            return y + m + day;
        };

        var sReturnDate = fnFormatDate(oGp.returnableDate);

        // ✅ Payload creation
        var oPayload = {
            GatePassType: oGp.GatePassType,
            Cocode: oGp.Cocode,
            Plant: oGp.Plant,
            FiscalYear: oGp.FiscalYear,
            Vendor: oGp.vendor,
            VendorName: oSelectedVendor.VendorName,
            VendorGST: oGp.vendorGST,
            ZipCode: oSelectedVendor.PostalCode,
            City: oSelectedVendor.City,
            ApprovalReq: "X",
            Department: oGp.Department,
            VehicleNo: oGp.VehicleNo || "",
            ModeOfDispatch: oGp.ModeOfDispatch,
            Remarks: oGp.Remarks,
            ReturnableDate: sReturnDate,

            // ✅ Items mapping
            GateReqItemNav: (oGp.items || []).map(function (it, index) {
                var fQty = parseFloat(String(it.quantity).replace(/,/g, '')) || 0;
                var fRate = parseFloat(String(it.rate).replace(/,/g, '')) || 0;
                var fValue = fQty * fRate;

                return {
                    GatePassType: oGp.GatePassType || "",
                    ItemNo: String((index + 1) * 10).padStart(5, '0'),
                    Material: it.material || "",
                    HSNCode: it.hsnCode || "",
                    UOM: it.uom || "EA",
                    ItemNetPrice: fRate.toFixed(2),
                    RequestedQuantity: fQty.toFixed(3),
                    Totalvalue: fValue.toFixed(2),
                    Remarks: it.remarks || ""
                };
            })
        };

        // ✅ Backend check
        var oODataModel = this.getOwnerComponent().getModel();
        if (!oODataModel) {
            MessageBox.error("Backend OData service not connected.");
            return;
        }

        // ✅ Call backend
        sap.ui.core.BusyIndicator.show(0);

        oODataModel.create("/GatePassReqHdrSet", oPayload, {
            success: function (oData) {
                sap.ui.core.BusyIndicator.hide();

                var sReqNo = oData.GatePassReqNo || "";
                var sMsg = oData.Message || "Gate Pass Request created successfully!";
                
                // Prevent duplicate request number if it's already in the message
                var sDisplayMsg = sMsg;
                if (sReqNo && sMsg.indexOf(sReqNo) === -1) {
                    sDisplayMsg += "\nRequest Number: " + sReqNo;
                }

                MessageBox.success(sDisplayMsg, {
                    actions: [MessageBox.Action.OK, "Copy Number"],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {
                        if (sAction === "Copy Number") {
                            navigator.clipboard.writeText(sReqNo).then(function() {
                                MessageToast.show("Request Number " + sReqNo + " copied!");
                            }).catch(function(err) {
                                // Fallback for browsers that don't support clipboard API
                                var textArea = document.createElement("textarea");
                                textArea.value = sReqNo;
                                document.body.appendChild(textArea);
                                textArea.select();
                                document.execCommand('copy');
                                document.body.removeChild(textArea);
                                MessageToast.show("Request Number copied!");
                            });
                        }
                        this._resetModel();
                    }.bind(this)
                });
            }.bind(this),

            error: function (oError) {
                sap.ui.core.BusyIndicator.hide();

                var sErrorMsg = "Failed to create Gate Pass.";
                try {
                    var oResp = JSON.parse(oError.responseText);
                    sErrorMsg = oResp.error.message.value;
                } catch (e) {}

                MessageBox.error(sErrorMsg);
            }
        });

    } catch (err) {
        sap.ui.core.BusyIndicator.hide();
        MessageBox.error("Client Error: " + err.message);
        console.error(err);
    }
},



		onClear: function () {
			this._resetModel();
		}
	});
});
